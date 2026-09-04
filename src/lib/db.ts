import { Pool } from "pg";
import type { InventoryItem, Marca } from "./types";
import {
  isBulkPriceOp,
  isBulkTextOp,
  type InventoryInput,
  type BulkPriceOp,
  type BulkTextOp,
} from "./inventory";

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

/* ── Cotizaciones guardadas ──────────────────────────────────────────── */

export async function ensureCotizacionesTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS shop_cotizaciones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      fx JSONB NOT NULL,
      envio JSONB NOT NULL,
      aduana JSONB NOT NULL,
      productos JSONB NOT NULL,
      resultados JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export interface CotizacionRow {
  id: string;
  nombre: string;
  fx: any;
  envio: any;
  aduana: any;
  productos: any;
  resultados: any;
  created_at: Date;
}

export async function getCotizaciones(): Promise<CotizacionRow[]> {
  await ensureCotizacionesTable();
  const res = await getPool().query(
    `SELECT id, nombre, fx, envio, aduana, productos, resultados, created_at
     FROM shop_cotizaciones
     ORDER BY created_at DESC`
  );
  return res.rows;
}

export async function insertCotizacion(c: {
  nombre: string;
  fx: unknown;
  envio: unknown;
  aduana: unknown;
  productos: unknown;
  resultados: unknown;
}): Promise<CotizacionRow> {
  await ensureCotizacionesTable();
  const res = await getPool().query(
    `INSERT INTO shop_cotizaciones (nombre, fx, envio, aduana, productos, resultados)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, nombre, fx, envio, aduana, productos, resultados, created_at`,
    [
      c.nombre,
      JSON.stringify(c.fx),
      JSON.stringify(c.envio),
      JSON.stringify(c.aduana),
      JSON.stringify(c.productos),
      JSON.stringify(c.resultados),
    ]
  );
  return res.rows[0];
}

export async function getCotizacion(id: string): Promise<CotizacionRow | null> {
  await ensureCotizacionesTable();
  const res = await getPool().query(
    `SELECT id, nombre, fx, envio, aduana, productos, resultados, created_at
     FROM shop_cotizaciones WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

/** Devuelve false si el id no existía. */
export async function deleteCotizacion(id: string): Promise<boolean> {
  await ensureCotizacionesTable();
  const res = await getPool().query(`DELETE FROM shop_cotizaciones WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/* ── Inventario ──────────────────────────────────────────────────────── */

let inventoryTablePromise: Promise<void> | null = null;

export async function ensureInventoryTable(): Promise<void> {
  // Memoizado por proceso: evita el DDL repetido y la carrera de
  // "CREATE TABLE IF NOT EXISTS" cuando dos requests entran a la vez.
  if (!inventoryTablePromise) {
    inventoryTablePromise = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS inventory_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          nombre TEXT NOT NULL,
          sku TEXT,
          variante TEXT,
          imagen TEXT,
          link TEXT,
          cantidad_inicial NUMERIC NOT NULL DEFAULT 0,
          cantidad_vendida NUMERIC NOT NULL DEFAULT 0,
          costo_unit_usd NUMERIC NOT NULL DEFAULT 0,
          costo_unit_ars NUMERIC NOT NULL DEFAULT 0,
          precio_venta_ars NUMERIC NOT NULL DEFAULT 0,
          estado TEXT NOT NULL DEFAULT 'en_deposito',
          ubicacion TEXT,
          notas TEXT,
          origen TEXT NOT NULL DEFAULT 'manual',
          origen_ref TEXT,
          marca_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      .then(() => undefined)
      .catch((err: unknown) => {
        // 23505/42P07: otra conexión creó la tabla al mismo tiempo. No es error.
        const code = (err as { code?: string })?.code;
        if (code === "23505" || code === "42P07") return;
        inventoryTablePromise = null; // permitir reintento ante fallos reales
        throw err;
      });
  }
  return inventoryTablePromise;
}

interface InventoryRow {
  id: string;
  nombre: string;
  sku: string | null;
  variante: string | null;
  imagen: string | null;
  link: string | null;
  cantidad_inicial: string | number;
  cantidad_vendida: string | number;
  costo_unit_usd: string | number;
  costo_unit_ars: string | number;
  precio_venta_ars: string | number;
  estado: string;
  ubicacion: string | null;
  notas: string | null;
  origen: string;
  origen_ref: string | null;
  marca_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapInventoryRow(r: InventoryRow): InventoryItem {
  return {
    id: r.id,
    nombre: r.nombre,
    sku: r.sku,
    variante: r.variante,
    imagen: r.imagen,
    link: r.link,
    cantidadInicial: Number(r.cantidad_inicial) || 0,
    cantidadVendida: Number(r.cantidad_vendida) || 0,
    costoUnitUSD: Number(r.costo_unit_usd) || 0,
    costoUnitARS: Number(r.costo_unit_ars) || 0,
    precioVentaARS: Number(r.precio_venta_ars) || 0,
    estado: (r.estado as InventoryItem["estado"]) || "en_deposito",
    ubicacion: r.ubicacion,
    notas: r.notas,
    origen: (r.origen as InventoryItem["origen"]) || "manual",
    origenRef: r.origen_ref,
    marcaId: r.marca_id,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

const INVENTORY_COLS = `id, nombre, sku, variante, imagen, link, cantidad_inicial,
  cantidad_vendida, costo_unit_usd, costo_unit_ars, precio_venta_ars, estado,
  ubicacion, notas, origen, origen_ref, marca_id, created_at, updated_at`;

export async function getInventoryItems(): Promise<InventoryItem[]> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT ${INVENTORY_COLS} FROM inventory_items ORDER BY created_at DESC`
  );
  return res.rows.map(mapInventoryRow);
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT ${INVENTORY_COLS} FROM inventory_items WHERE id = $1`,
    [id]
  );
  return res.rows[0] ? mapInventoryRow(res.rows[0]) : null;
}

/** Mapa campo del modelo → columna de la tabla, para inserts y updates parciales. */
const FIELD_TO_COL: Record<string, string> = {
  nombre: "nombre",
  sku: "sku",
  variante: "variante",
  imagen: "imagen",
  link: "link",
  cantidadInicial: "cantidad_inicial",
  cantidadVendida: "cantidad_vendida",
  costoUnitUSD: "costo_unit_usd",
  costoUnitARS: "costo_unit_ars",
  precioVentaARS: "precio_venta_ars",
  estado: "estado",
  ubicacion: "ubicacion",
  notas: "notas",
  origen: "origen",
  origenRef: "origen_ref",
  marcaId: "marca_id",
};

export async function insertInventoryItem(input: InventoryInput): Promise<InventoryItem> {
  await ensureSchema();
  const cols: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];

  for (const [field, col] of Object.entries(FIELD_TO_COL)) {
    if (field in input && (input as Record<string, unknown>)[field] !== undefined) {
      cols.push(col);
      placeholders.push(`$${values.length + 1}`);
      values.push((input as Record<string, unknown>)[field]);
    }
  }

  if (!cols.includes("nombre")) {
    throw new Error("El ítem de inventario necesita un nombre");
  }

  const res = await getPool().query(
    `INSERT INTO inventory_items (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${INVENTORY_COLS}`,
    values
  );
  return mapInventoryRow(res.rows[0]);
}

export async function updateInventoryItem(
  id: string,
  input: InventoryInput
): Promise<InventoryItem | null> {
  await ensureSchema();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [field, col] of Object.entries(FIELD_TO_COL)) {
    if (field in input && (input as Record<string, unknown>)[field] !== undefined) {
      sets.push(`${col} = $${values.length + 1}`);
      values.push((input as Record<string, unknown>)[field]);
    }
  }

  if (sets.length === 0) return getInventoryItem(id);

  sets.push("updated_at = now()");
  values.push(id);

  const res = await getPool().query(
    `UPDATE inventory_items SET ${sets.join(", ")}
     WHERE id = $${values.length}
     RETURNING ${INVENTORY_COLS}`,
    values
  );
  return res.rows[0] ? mapInventoryRow(res.rows[0]) : null;
}

/** Devuelve false si el id no existía. */
export async function deleteInventoryItem(id: string): Promise<boolean> {
  await ensureSchema();
  const res = await getPool().query(`DELETE FROM inventory_items WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** oids de CSSBuy ya presentes en el inventario, para no importarlos dos veces. */
export async function getInventoryOrigenRefs(origen: string): Promise<string[]> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT DISTINCT origen_ref FROM inventory_items WHERE origen = $1 AND origen_ref IS NOT NULL`,
    [origen]
  );
  return res.rows.map((r: { origen_ref: string }) => r.origen_ref);
}

/**
 * Edición masiva. Aplica los campos fijos de `patch` y, si viene, la
 * operación de precio, en una sola sentencia por lote.
 *
 * El precio se calcula en SQL porque el modo "markup" depende del costo de
 * cada fila: traer todo a Node y volver a escribir sería N round-trips.
 */
export async function bulkUpdateInventory(
  ids: string[],
  patch: InventoryInput,
  precio?: BulkPriceOp,
  textos?: BulkTextOp[]
): Promise<InventoryItem[]> {
  await ensureSchema();
  if (ids.length === 0) return [];

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [field, col] of Object.entries(FIELD_TO_COL)) {
    if (field in patch && (patch as Record<string, unknown>)[field] !== undefined) {
      sets.push(`${col} = $${values.length + 1}`);
      values.push((patch as Record<string, unknown>)[field]);
    }
  }

  if (precio && isBulkPriceOp(precio)) {
    const i = values.length + 1;
    values.push(precio.valor);
    if (precio.modo === "porcentaje") {
      // GREATEST evita dejar precios negativos con un -150%
      sets.push(`precio_venta_ars = GREATEST(0, ROUND(precio_venta_ars * (1 + $${i}::numeric / 100)))`);
    } else if (precio.modo === "markup") {
      sets.push(`precio_venta_ars = ROUND(costo_unit_ars * $${i}::numeric)`);
    } else {
      sets.push(`precio_venta_ars = GREATEST(0, $${i}::numeric)`);
    }
  }

  // Texto: salvo "fijar", el resultado depende de lo que ya tenía cada fila,
  // así que se expresa en SQL en vez de traer todo a Node y reescribirlo.
  for (const op of textos ?? []) {
    if (!isBulkTextOp(op)) continue;
    const col = op.campo === "nombre" ? "nombre" : "notas";
    // COALESCE porque notas puede ser NULL y en Postgres NULL || 'x' es NULL.
    const actual = `COALESCE(${col}, '')`;
    if (op.modo === "fijar") {
      sets.push(`${col} = $${values.length + 1}`);
      values.push(op.valor);
    } else if (op.modo === "reemplazar") {
      sets.push(`${col} = replace(${actual}, $${values.length + 1}, $${values.length + 2})`);
      values.push(op.buscar, op.valor);
    } else if (op.modo === "prefijo") {
      sets.push(`${col} = $${values.length + 1} || ${actual}`);
      values.push(op.valor);
    } else {
      sets.push(`${col} = ${actual} || $${values.length + 1}`);
      values.push(op.valor);
    }
  }

  if (sets.length === 0) return [];

  sets.push("updated_at = now()");
  values.push(ids);

  const res = await getPool().query(
    `UPDATE inventory_items SET ${sets.join(", ")}
     WHERE id = ANY($${values.length}::uuid[])
     RETURNING ${INVENTORY_COLS}`,
    values
  );
  return res.rows.map(mapInventoryRow);
}

/** Borrado masivo. Devuelve cuántas filas se borraron. */
export async function bulkDeleteInventory(ids: string[]): Promise<number> {
  await ensureSchema();
  if (ids.length === 0) return 0;
  const res = await getPool().query(
    `DELETE FROM inventory_items WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return res.rowCount ?? 0;
}

/**
 * Escribe precio y costo por ítem en una sola sentencia.
 *
 * Cada fila lleva su propio valor, así que no sirve el UPDATE ... WHERE IN de
 * `bulkUpdateInventory`: se arma un VALUES y se hace join contra él. Un solo
 * round-trip para todo el lote.
 */
export async function applyInventoryPrices(
  cambios: { id: string; precioVentaARS: number; costoUnitARS: number; costoUnitUSD: number }[]
): Promise<number> {
  await ensureSchema();
  if (cambios.length === 0) return 0;

  const values: unknown[] = [];
  const tuplas = cambios.map((c, i) => {
    const b = i * 4;
    values.push(c.id, c.precioVentaARS, c.costoUnitARS, c.costoUnitUSD);
    return `($${b + 1}::uuid, $${b + 2}::numeric, $${b + 3}::numeric, $${b + 4}::numeric)`;
  });

  const res = await getPool().query(
    `UPDATE inventory_items AS t
     SET precio_venta_ars = v.precio,
         costo_unit_ars   = v.costo_ars,
         costo_unit_usd   = v.costo_usd,
         updated_at       = now()
     FROM (VALUES ${tuplas.join(", ")}) AS v(id, precio, costo_ars, costo_usd)
     WHERE t.id = v.id`,
    values
  );
  return res.rowCount ?? 0;
}

/* ── Marcas ──────────────────────────────────────────────────────────── */

let marcasTablePromise: Promise<void> | null = null;

export async function ensureMarcasTable(): Promise<void> {
  // El ALTER y la FK apuntan a inventory_items: tiene que existir primero.
  await ensureInventoryTable();
  if (!marcasTablePromise) {
    marcasTablePromise = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS marcas (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          nombre TEXT NOT NULL,
          activa BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      .then(() =>
        // Case-insensitive: evita que convivan "Amiri" y "amiri" como marcas
        // distintas, que es justo lo que rompe un filtro por marca.
        getPool().query(
          `CREATE UNIQUE INDEX IF NOT EXISTS marcas_nombre_lower_idx ON marcas (lower(nombre))`
        )
      )
      .then(() =>
        // inventory_items ya existe en las bases viejas sin esta columna, y el
        // CREATE TABLE IF NOT EXISTS no agrega columnas: hay que sumarla acá.
        getPool().query(
          `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS marca_id UUID`
        )
      )
      .then(() =>
        // La FK se agrega aparte porque inventory_items ya existía sin ella.
        // ON DELETE SET NULL: borrar una marca desasigna, nunca borra productos.
        getPool().query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'inventory_items_marca_id_fkey'
            ) THEN
              ALTER TABLE inventory_items
                ADD CONSTRAINT inventory_items_marca_id_fkey
                FOREIGN KEY (marca_id) REFERENCES marcas(id) ON DELETE SET NULL;
            END IF;
          END $$;
        `)
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code;
        if (code === "23505" || code === "42P07" || code === "42710") return;
        marcasTablePromise = null;
        throw err;
      });
  }
  return marcasTablePromise;
}

function mapMarca(r: { id: string; nombre: string; activa: boolean; created_at: Date }): Marca {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function getMarcas(): Promise<Marca[]> {
  await ensureMarcasTable();
  const res = await getPool().query(
    `SELECT id, nombre, activa, created_at FROM marcas ORDER BY lower(nombre)`
  );
  return res.rows.map(mapMarca);
}

/** Alta idempotente: si la marca ya existe (sin distinguir mayúsculas) la devuelve. */
export async function insertMarca(nombre: string): Promise<Marca> {
  await ensureMarcasTable();
  const limpio = nombre.trim();
  const res = await getPool().query(
    `INSERT INTO marcas (nombre) VALUES ($1)
     ON CONFLICT (lower(nombre)) DO UPDATE SET nombre = marcas.nombre
     RETURNING id, nombre, activa, created_at`,
    [limpio]
  );
  return mapMarca(res.rows[0]);
}

export async function updateMarca(
  id: string,
  campos: { nombre?: string; activa?: boolean }
): Promise<Marca | null> {
  await ensureMarcasTable();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (typeof campos.nombre === "string" && campos.nombre.trim()) {
    sets.push(`nombre = $${values.length + 1}`);
    values.push(campos.nombre.trim());
  }
  if (typeof campos.activa === "boolean") {
    sets.push(`activa = $${values.length + 1}`);
    values.push(campos.activa);
  }
  if (sets.length === 0) return null;
  values.push(id);
  const res = await getPool().query(
    `UPDATE marcas SET ${sets.join(", ")} WHERE id = $${values.length}
     RETURNING id, nombre, activa, created_at`,
    values
  );
  return res.rows[0] ? mapMarca(res.rows[0]) : null;
}

/** Borra la marca. Los productos que la tenían quedan sin marca, no se borran. */
export async function deleteMarca(id: string): Promise<boolean> {
  await ensureMarcasTable();
  const res = await getPool().query(`DELETE FROM marcas WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Cuántos ítems de inventario tiene asignada cada marca. */
export async function contarItemsPorMarca(): Promise<Record<string, number>> {
  await ensureMarcasTable();
  const res = await getPool().query(
    `SELECT marca_id, count(*)::int AS n FROM inventory_items
     WHERE marca_id IS NOT NULL GROUP BY marca_id`
  );
  const out: Record<string, number> = {};
  for (const r of res.rows) out[r.marca_id] = r.n;
  return out;
}

/**
 * Garantiza todo el esquema del inventario en el orden correcto: primero la
 * tabla de ítems, después marcas con su columna y su FK. Todas las lecturas y
 * escrituras del inventario pasan por acá, porque INVENTORY_COLS ya nombra
 * marca_id y en una base vieja esa columna todavía no existe.
 */
export async function ensureSchema(): Promise<void> {
  await ensureMarcasTable();
}

/** Escribe el SKU de cada ítem en una sola sentencia (un valor por fila). */
export async function applyInventorySkus(
  cambios: { id: string; sku: string }[]
): Promise<number> {
  await ensureSchema();
  if (cambios.length === 0) return 0;

  const values: unknown[] = [];
  const tuplas = cambios.map((c, i) => {
    const b = i * 2;
    values.push(c.id, c.sku);
    return `($${b + 1}::uuid, $${b + 2}::text)`;
  });

  const res = await getPool().query(
    `UPDATE inventory_items AS t
     SET sku = v.sku, updated_at = now()
     FROM (VALUES ${tuplas.join(", ")}) AS v(id, sku)
     WHERE t.id = v.id`,
    values
  );
  return res.rowCount ?? 0;
}
