import { ensureInventoryTable, getPool } from "./db";
import { InventorySaleError, validateSale, type InventorySalesReport } from "./inventory-sales";

let schema: Promise<void> | undefined;
async function ensureSales() {
  await ensureInventoryTable();
  schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS inventory_sales (
    id UUID PRIMARY KEY, item_id UUID NOT NULL, fecha DATE NOT NULL,
    nombre TEXT NOT NULL, talle TEXT NOT NULL DEFAULT '', unidades INTEGER NOT NULL CHECK (unidades > 0),
    precio_unit_ars NUMERIC(14,2) NOT NULL CHECK (precio_unit_ars >= 0),
    costo_unit_ars NUMERIC NOT NULL, anterior BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS inventory_sales_item_idx ON inventory_sales(item_id);
    CREATE INDEX IF NOT EXISTS inventory_sales_date_idx ON inventory_sales(fecha);`)
    .then(() => {}).catch(error => { schema = undefined; throw error; });
  await schema;
}

export async function recordInventorySale(raw: Record<string, unknown>) {
  const sale = validateSale(raw);
  await ensureSales();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Lock the product so concurrent sales cannot overwrite stock or backfill twice.
    const { rows: items } = await client.query("SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE", [sale.itemId]);
    const existing = (await client.query("SELECT *,to_char(fecha,'YYYY-MM-DD') AS sale_date FROM inventory_sales WHERE id=$1", [sale.requestId])).rows[0];
    if (existing) {
      if (existing.item_id !== sale.itemId || existing.sale_date !== sale.fecha || existing.unidades !== sale.unidades || Number(existing.precio_unit_ars) !== sale.precioUnitARS || existing.talle !== sale.talle || existing.anterior !== sale.anterior) throw new InventorySaleError("Ese identificador ya corresponde a otra venta.", 409);
      await client.query("COMMIT"); return;
    }
    const item = items[0];
    if (!item) throw new InventorySaleError("El producto ya no está en el inventario.", 404);
    const talles = Array.isArray(item.talles) ? item.talles as { talle: string; cantidadInicial: number; cantidadVendida: number }[] : [];
    const variant = talles.length ? talles.find(t => t.talle === sale.talle) : undefined;
    if ((talles.length && !variant) || (!talles.length && sale.talle)) throw new InventorySaleError("Elegí un talle válido del producto.");
    const initial = Number(variant?.cantidadInicial ?? item.cantidad_inicial);
    const sold = Number(variant?.cantidadVendida ?? item.cantidad_vendida);
    if (sale.anterior) {
      const { rows } = await client.query("SELECT COALESCE(SUM(unidades),0) AS units FROM inventory_sales WHERE item_id=$1 AND talle=$2", [sale.itemId, sale.talle]);
      const recorded = await client.query("SELECT COALESCE(SUM(unidades),0) AS units FROM inventory_sales WHERE item_id=$1", [sale.itemId]);
      const totalSold = talles.length ? talles.reduce((sum, t) => sum + Number(t.cantidadVendida), 0) : sold;
      if (sale.unidades > Math.min(sold - Number(rows[0].units), totalSold - Number(recorded.rows[0].units))) throw new InventorySaleError("Esa cantidad supera las ventas anteriores pendientes de fecha. Actualizá el inventario.", 409);
    } else {
      if (sale.unidades > initial - sold) throw new InventorySaleError("No hay suficiente stock. Actualizá el inventario y revisá las unidades.", 409);
      if (variant) variant.cantidadVendida = sold + sale.unidades;
      const totalSold = talles.length ? talles.reduce((sum, t) => sum + Number(t.cantidadVendida), 0) : sold + sale.unidades;
      const totalInitial = talles.length ? talles.reduce((sum, t) => sum + Number(t.cantidadInicial), 0) : initial;
      await client.query(`UPDATE inventory_items SET cantidad_vendida=$2, talles=$3::jsonb,
        estado=CASE WHEN $2::numeric >= $4::numeric THEN 'agotado' ELSE estado END, updated_at=now() WHERE id=$1`,
      [sale.itemId, totalSold, JSON.stringify(talles), totalInitial]);
    }
    // Snapshots survive later price edits and removal of the inventory product.
    await client.query(`INSERT INTO inventory_sales (id,item_id,fecha,nombre,talle,unidades,precio_unit_ars,costo_unit_ars,anterior)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [sale.requestId, sale.itemId, sale.fecha, item.nombre, sale.talle, sale.unidades, sale.precioUnitARS, item.costo_unit_ars, sale.anterior]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function getInventorySalesReport(mes: string): Promise<InventorySalesReport> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || mes < "1900-01") throw new InventorySaleError("Elegí un mes válido.");
  await ensureSales();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const months = await client.query(`SELECT to_char(fecha,'YYYY-MM') AS mes, SUM(unidades) AS units,
      SUM(unidades*precio_unit_ars) AS amount FROM inventory_sales GROUP BY 1 ORDER BY 1 DESC`);
    const sales = await client.query(`SELECT id,to_char(fecha,'YYYY-MM-DD') AS fecha,nombre,talle,unidades,precio_unit_ars,
      unidades*precio_unit_ars AS total FROM inventory_sales WHERE fecha >= $1::date AND fecha < $1::date + INTERVAL '1 month' ORDER BY fecha DESC,created_at DESC,id`, [`${mes}-01`]);
    const pending = await client.query(`WITH sold AS (
      SELECT i.id, t->>'talle' AS talle,(t->>'cantidadVendida')::numeric AS units FROM inventory_items i CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.talles,'[]')) t
      UNION ALL SELECT id,'' AS talle,cantidad_vendida FROM inventory_items WHERE talles IS NULL OR jsonb_array_length(talles)=0
    ), recorded AS (SELECT item_id,talle,SUM(unidades) AS units FROM inventory_sales GROUP BY item_id,talle)
      SELECT COALESCE(s.id,r.item_id) AS id,COALESCE(s.talle,r.talle) AS talle, COALESCE(s.units,0)-COALESCE(r.units,0) AS pending
      FROM sold s FULL JOIN recorded r ON s.id=r.item_id AND s.talle=r.talle
      WHERE EXISTS (SELECT 1 FROM inventory_items i WHERE i.id=COALESCE(s.id,r.item_id))`);
    await client.query("COMMIT");
    return {
      meses: months.rows.map(r => ({ mes: r.mes, facturadoARS: Number(r.amount), unidades: Number(r.units) })),
      ventas: sales.rows.map(r => ({ id: r.id, fecha: r.fecha, nombre: r.nombre, talle: r.talle, unidades: r.unidades, precioUnitARS: Number(r.precio_unit_ars), totalARS: Number(r.total) })),
      pendientes: pending.rows.filter(r => Number(r.pending) > 0).map(r => ({ itemId: r.id, talle: r.talle, unidades: Number(r.pending) })),
      discrepancias: pending.rows.filter(r => Number(r.pending) < 0).length,
    };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
