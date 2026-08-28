import { Pool } from "pg";

let pool: Pool | null = null;

export function isPgConfigured(): boolean {
  return Boolean(process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 4,
      connectionTimeoutMillis: 8000,
    });
  }
  return pool;
}

export async function ensureCssbuyOrdersTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS cssbuy_orders (
      id BIGSERIAL PRIMARY KEY,
      order_no TEXT UNIQUE,
      status TEXT,
      title TEXT,
      total_cny NUMERIC,
      currency TEXT,
      tracking TEXT,
      order_date TIMESTAMPTZ,
      raw JSONB NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export interface CssbuyOrderRow {
  id?: number;
  order_no: string;
  status: string | null;
  title: string | null;
  total_cny: number | null;
  currency: string | null;
  tracking: string | null;
  order_date: Date | null;
  raw: unknown;
  synced_at?: Date;
}

export async function upsertCssbuyOrders(
  rows: CssbuyOrderRow[]
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const db = getPool();
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const res = await db.query(
      `INSERT INTO cssbuy_orders (order_no, status, title, total_cny, currency, tracking, order_date, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (order_no) DO UPDATE SET
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         total_cny = EXCLUDED.total_cny,
         currency = EXCLUDED.currency,
         tracking = EXCLUDED.tracking,
         order_date = EXCLUDED.order_date,
         raw = EXCLUDED.raw,
         synced_at = now()
       RETURNING (xmax = 0) AS was_inserted`,
      [
        r.order_no,
        r.status,
        r.title,
        r.total_cny,
        r.currency,
        r.tracking,
        r.order_date,
        JSON.stringify(r.raw),
      ]
    );
    if (res.rows[0]?.was_inserted) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

export async function pruneCssbuyNonWarehouse(): Promise<number> {
  // Deprecated: ahora se conservan todas las órdenes válidas (nuevas, en proceso, en almacén).
  return 0;
}

export async function getCssbuyOrders(): Promise<CssbuyOrderRow[]> {
  if (!isPgConfigured()) return [];
  const db = getPool();
  const res = await db.query(
    `SELECT id, order_no, status, title, total_cny, currency, tracking, order_date, raw, synced_at
     FROM cssbuy_orders
     WHERE status NOT IN ('0', '-1', '7', '8', '9', '10')
       AND LOWER(COALESCE(status, '')) NOT LIKE '%invalid%'
       AND LOWER(COALESCE(status, '')) NOT LIKE '%cancel%'
       AND LOWER(COALESCE(status, '')) NOT LIKE '%refund%'
       AND LOWER(COALESCE(status, '')) NOT LIKE '%return%'
       AND LOWER(COALESCE(status, '')) NOT LIKE '%close%'
       AND LOWER(COALESCE(status, '')) NOT LIKE '%unpaid%'
       AND COALESCE(status, '') NOT LIKE '%无效%'
       AND COALESCE(status, '') NOT LIKE '%取消%'
       AND COALESCE(status, '') NOT LIKE '%退款%'
       AND COALESCE(status, '') NOT LIKE '%退货%'
       AND COALESCE(status, '') NOT LIKE '%失效%'
       AND COALESCE(status, '') NOT LIKE '%关闭%'
     ORDER BY order_date DESC NULLS LAST, id DESC`
  );
  return res.rows;
}

export function rowToCssbuyOrder(r: CssbuyOrderRow) {
  const raw = (r.raw && typeof r.raw === "object" ? r.raw : {}) as Record<string, any>;
  
  // Peso real de la(s) prenda(s): CSSBuy lo reporta en orderGoods.weightWithBox
  // (peso medido, en gramos). weight suele venir en 0, así que se prefiere weightWithBox.
  function goodsWeight(g: any): number {
    if (!g || typeof g !== "object") return 0;
    return Number(g.weightWithBox ?? g.weight ?? g.orderweight ?? g.order_weight ?? 0) || 0;
  }
  const og = raw.orderGoods;
  const firstOg = Array.isArray(og) ? og[0] : (og && typeof og === "object" ? og : {});
  const pesoG = Array.isArray(og)
    ? og.reduce((s: number, g: any) => s + goodsWeight(g), 0)
    : goodsWeight(og);

  const precio = Number(r.total_cny ?? firstOg.price ?? raw.goodsprice ?? raw.goods_price ?? raw.price ?? raw.unit_price ?? 0);
  // Flete interno (envío doméstico China -> depósito CSSBuy)
  const envioLocal = Number(raw.sendPrice ?? raw.sendprice ?? raw.send_price ?? raw.freight ?? 0);
  const envioChina = Number(raw.chinashipping ?? raw.sendPrice ?? 0);
  const cantidad = Math.max(1, Math.round(Number(firstOg.num ?? raw.goodsnum ?? raw.goods_num ?? raw.quantity ?? 1)));
  const fecha = r.order_date
    ? Math.floor(new Date(r.order_date).getTime() / 1000)
    : Number(raw.addtime ?? raw.createtime ?? Math.floor(Date.now() / 1000));

  // Imagen principal del producto o SKU
  const imagen = String(
    firstOg.image ??
    firstOg.skuImage ??
    firstOg.pic ??
    firstOg.goodsimg ??
    firstOg.goods_img ??
    raw.goodsimg ??
    raw.goods_img ??
    raw.skuimg ??
    raw.sku_img ??
    raw.image ??
    raw.pic ??
    ""
  );

  // Fotos de control de calidad (QC / inspección en almacén)
  const fotos_qc: string[] = [];
  if (Array.isArray(firstOg.qualityImageList)) {
    for (const item of firstOg.qualityImageList) {
      if (item?.url) fotos_qc.push(String(item.url));
      else if (typeof item === "string" && item) fotos_qc.push(item);
    }
  } else if (typeof firstOg.qualityImages === "string" && firstOg.qualityImages.trim()) {
    const list = firstOg.qualityImages.split(",").map((s: string) => s.trim()).filter(Boolean);
    for (const p of list) {
      if (p.startsWith("http")) fotos_qc.push(p);
      else fotos_qc.push(`https://usimage.cssbuy.com/${p}`);
    }
  }

  // Foto del paquete sobre la balanza
  const foto_peso = firstOg.weightImage ? String(firstOg.weightImage) : undefined;

  return {
    oid: r.order_no || String(firstOg.orderId ?? raw.oid ?? raw.order_sn ?? ""),
    producto: r.title || String(firstOg.name ?? raw.goodsname ?? raw.goods_name ?? raw.title ?? `Pedido #${r.order_no}`),
    imagen,
    url: String(firstOg.url ?? raw.goodsurl ?? raw.goods_url ?? raw.url ?? raw.product_url ?? ""),
    vendedor: String(firstOg.seller ?? raw.goodsseller ?? raw.goods_seller ?? raw.seller ?? raw.shop_name ?? ""),
    variante: String(firstOg.skuInfo ?? firstOg.remark ?? raw.goodssize ?? raw.goods_size ?? raw.size ?? raw.variant ?? raw.sku_name ?? ""),
    precio_unitario_cny: precio,
    envio_local_cny: envioLocal,
    envio_china_cny: envioChina,
    cantidad,
    estado: r.status || String(raw.statename ?? raw.status_name ?? raw.state ?? "Procesando"),
    peso_g: pesoG,
    tracking: r.tracking || String(raw.expressno ?? raw.express_no ?? raw.tracking ?? ""),
    fecha_pedido: fecha,
    fotos_qc: fotos_qc.length > 0 ? fotos_qc : undefined,
    foto_peso,
  };
}
