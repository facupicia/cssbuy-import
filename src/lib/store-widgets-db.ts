import { getPool } from "./db";
import { loadStoreCredentials } from "./store-connection";
import { defaultWidgetConfig, type WidgetConfig } from "./store-widgets";
let schema: Promise<unknown> | undefined;
async function ensure() {
  schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS tiendanube_widgets (
    store_id TEXT PRIMARY KEY, draft JSONB NOT NULL, published JSONB,
    version INTEGER NOT NULL DEFAULT 1, published_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`).catch(e => { schema = undefined; throw e; });
  await schema;
}
export async function widgetStoreId() {
  const connection = await loadStoreCredentials();
  if (!connection) throw new Error("Conectá Tiendanube desde Inventario para personalizar tu tienda");
  return connection.storeId;
}
export async function readWidgets(storeId: string) {
  await ensure();
  const { rows } = await getPool().query("SELECT draft, published, version, published_at FROM tiendanube_widgets WHERE store_id=$1", [storeId]);
  const row = rows[0];
  return { storeId, draft: (row?.draft ?? defaultWidgetConfig()) as WidgetConfig, published: (row?.published ?? null) as WidgetConfig | null,
    version: Number(row?.version ?? 0), publishedAt: row?.published_at ?? null };
}
export async function writeWidgets(storeId: string, version: number, config: WidgetConfig, publish: boolean) {
  await ensure();
  // One statement is a compare-and-swap, including first save; concurrent tabs cannot silently overwrite.
  const result = version === 0
    ? await getPool().query(`INSERT INTO tiendanube_widgets(store_id,draft,published,published_at) VALUES($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END) ON CONFLICT DO NOTHING RETURNING version`, [storeId, config, publish ? config : null, publish])
    : await getPool().query(`UPDATE tiendanube_widgets SET draft=$2, published=CASE WHEN $4 THEN $2::jsonb ELSE published END,
      published_at=CASE WHEN $4 THEN now() ELSE published_at END, updated_at=now(), version=version+1 WHERE store_id=$1 AND version=$3 RETURNING version`, [storeId, config, version, publish]);
  if (!result.rowCount) return null;
  return readWidgets(storeId);
}
