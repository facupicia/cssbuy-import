import { createHash } from "node:crypto";
import { getPool, ensureCssbuyOrdersTable, upsertCssbuyOrders, getCssbuyOrders, rowToCssbuyOrder } from "./db";
import { rawItemsToRows } from "./cssbuy-sync";
import type { CssbuyTransaction } from "./types";

let schema: Promise<void> | null = null;
async function ensureBridge() {
  if (!schema) schema = ensureCssbuyOrdersTable().then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS cssbuy_records (id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS cssbuy_sync_state (id SMALLINT PRIMARY KEY CHECK(id=1),
      synced_at TIMESTAMPTZ NOT NULL, orders_count INTEGER NOT NULL, records_count INTEGER,
      records_warning TEXT)
  `)).then(() => undefined).catch(e => { schema = null; throw e; });
  return schema;
}

export function parseBridgePayload(body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Datos de sincronización inválidos");
  if (!Array.isArray(body.orders) || body.orders.length > 5000 || body.orders.some(o => !o || typeof o !== "object" || Array.isArray(o)
    || !["oid", "order_sn", "ordersn", "orderSn", "order_no", "orderNo", "orderid", "order_id", "id"].some(k => typeof o[k] === "string" || typeof o[k] === "number"))) throw new Error("Lista de pedidos inválida");
  let records: CssbuyTransaction[] | null = null;
  if (body.records != null) {
    if (!Array.isArray(body.records) || body.records.length > 10000) throw new Error("Lista de movimientos inválida");
    records = body.records.map(r => {
      if (!r || typeof r !== "object" || Array.isArray(r) || !["string", "number"].includes(typeof r.money)
        || !Number.isFinite(Number(String(r.money).replace(/,/g, ""))) || typeof r.action !== "string" || r.action.length > 200
        || typeof r.remark !== "string" || r.remark.length > 20000) throw new Error("Movimiento inválido");
      const value: CssbuyTransaction = { money: r.money, action: r.action, remark: r.remark,
        ...(typeof r.addtime === "string" || typeof r.addtime === "number" ? { addtime: r.addtime } : {}) };
      value.id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id).slice(0, 200)
        : createHash("sha256").update(JSON.stringify(value)).digest("hex");
      return value;
    });
  }
  const warning = records === null ? "Los movimientos no se actualizaron. Se conservan los anteriores." : null;
  return { rows: rawItemsToRows(body.orders), records, warning };
}

export async function bridgeStatus() {
  await ensureBridge();
  const [state, records] = await Promise.all([
    getPool().query("SELECT synced_at,orders_count,records_count,records_warning FROM cssbuy_sync_state WHERE id=1"),
    getPool().query("SELECT data FROM cssbuy_records ORDER BY id"),
  ]);
  return { lastSync: state.rows[0] ?? null, records: records.rows.map(r => r.data) as CssbuyTransaction[] };
}

export async function importBridge(payload: ReturnType<typeof parseBridgePayload>) {
  await ensureBridge();
  const client = await getPool().connect();
  let inserted = 0; let updated = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('plug:cssbuy:records',0))");
    ({ inserted, updated } = await upsertCssbuyOrders(payload.rows, client));
    if (payload.records) for (const record of payload.records) {
      await client.query("INSERT INTO cssbuy_records(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data", [record.id, JSON.stringify(record)]);
    }
    await client.query(`INSERT INTO cssbuy_sync_state(id,synced_at,orders_count,records_count,records_warning)
      VALUES(1,now(),$1,$2,$3) ON CONFLICT(id) DO UPDATE SET synced_at=now(),orders_count=$1,records_count=$2,records_warning=$3`,
    [payload.rows.length, payload.records?.length ?? null, payload.warning]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  return { ok: true, inserted, updated, imported: payload.rows.length, warning: payload.warning,
    orders: (await getCssbuyOrders()).map(rowToCssbuyOrder), ...await bridgeStatus() };
}
