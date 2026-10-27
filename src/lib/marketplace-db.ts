import { randomUUID } from "node:crypto";
import { getPool, getInventoryItems, getMarcas, getInventoryItem } from "./db";
import { marketplaceProduct, marketplaceListingUrl, type MarketplaceDraft, type MarketplaceInput, type MarketplacePayload, type MarketplaceStatus } from "./marketplace";
import { storePhotos } from "./store-product";

let schema: Promise<void> | undefined;
async function ensureSchema() {
  if (!schema) schema = getPool().query(`CREATE TABLE IF NOT EXISTS plug_marketplace_drafts (
    id UUID PRIMARY KEY, owner_id TEXT NOT NULL, item_id UUID NOT NULL,
    details JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'draft', listing_url TEXT,
    revision INTEGER NOT NULL DEFAULT 1, sent_at TIMESTAMPTZ, needs_update BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(owner_id,item_id), UNIQUE(owner_id,listing_url)
  ); CREATE TABLE IF NOT EXISTS plug_marketplace_limits (
    owner_id TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL, requests INTEGER NOT NULL
  )`).then(() => {}).catch(e => { schema = undefined; throw e; });
  return schema;
}
type Row = { id: string; details: MarketplaceInput; status: MarketplaceStatus; listing_url: string | null; revision: number; sent_at: Date | null; updated_at: Date; needs_update: boolean };
function map(row: Row): MarketplaceDraft { return { ...row.details, id: row.id, status: row.status, listingUrl: row.listing_url, revision: row.revision, sentAt: row.sent_at?.toISOString() ?? null, updatedAt: row.updated_at.toISOString(), needsUpdate: row.needs_update }; }
export class MarketplaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function marketplaceRateLimit(owner: string) {
  await ensureSchema();
  const r = await getPool().query(`INSERT INTO plug_marketplace_limits VALUES ($1,now(),1)
    ON CONFLICT(owner_id) DO UPDATE SET requests=CASE WHEN plug_marketplace_limits.window_start < now()-interval '1 minute' THEN 1 ELSE plug_marketplace_limits.requests+1 END,
    window_start=CASE WHEN plug_marketplace_limits.window_start < now()-interval '1 minute' THEN now() ELSE plug_marketplace_limits.window_start END RETURNING requests`, [owner]);
  if (r.rows[0].requests > 90) throw new MarketplaceError("Esperá un minuto antes de continuar.", 429);
}
export async function marketplaceWorkspace(owner: string) {
  await ensureSchema();
  const [items, brands, drafts] = await Promise.all([getInventoryItems({ media: "urls" }), getMarcas(), getPool().query<Row>("SELECT * FROM plug_marketplace_drafts WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 2000", [owner])]);
  return { products: items.map(it => marketplaceProduct(it, brands.find(b => b.id === it.marcaId)?.nombre)), drafts: drafts.rows.map(map) };
}
async function currentProduct(itemId: string) {
  const item = await getInventoryItem(itemId);
  if (!item) throw new MarketplaceError("El producto ya no está en el inventario.", 404);
  return { item, product: marketplaceProduct(item) };
}
function checkProduct(product: ReturnType<typeof marketplaceProduct>, input: MarketplaceInput) {
  if (product.version !== input.sourceVersion) throw new MarketplaceError("El inventario cambió. Revisá precio, talles y fotos y guardá de nuevo.", 409);
  if (product.issues.length) throw new MarketplaceError(product.issues.join(" "), 409);
}
export async function saveMarketplaceDraft(owner: string, input: MarketplaceInput, revision: number) {
  await ensureSchema();
  const { product } = await currentProduct(input.itemId); checkProduct(product, input);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new MarketplaceError("Actualizá la publicación antes de guardar.");
  const r = revision === 0
    ? await getPool().query<Row>(`INSERT INTO plug_marketplace_drafts(id,owner_id,item_id,details) VALUES($1,$2,$3,$4::jsonb)
       ON CONFLICT(owner_id,item_id) DO NOTHING RETURNING *`, [randomUUID(), owner, input.itemId, JSON.stringify(input)])
    : await getPool().query<Row>(`UPDATE plug_marketplace_drafts SET details=$4::jsonb,revision=revision+1,updated_at=now(),
       status=CASE WHEN status='sent' THEN 'draft' ELSE status END,needs_update=(listing_url IS NOT NULL)
       WHERE owner_id=$1 AND item_id=$2 AND revision=$3 RETURNING *`, [owner, input.itemId, revision, JSON.stringify(input)]);
  if (!r.rows.length) throw new MarketplaceError("Otra pestaña guardó cambios. Actualizá la lista antes de continuar.", 409);
  return map(r.rows[0]);
}
export async function exportMarketplaceDraft(owner: string, itemId: string, revision: number): Promise<MarketplacePayload> {
  await ensureSchema();
  const r = await getPool().query<Row>("SELECT * FROM plug_marketplace_drafts WHERE owner_id=$1 AND item_id=$2", [owner, itemId]);
  if (!r.rows[0]) throw new MarketplaceError("Guardá el borrador antes de enviarlo a Chrome.", 404);
  const draft = map(r.rows[0]);
  if (draft.revision !== revision) throw new MarketplaceError("El borrador cambió. Volvé a cargarlo.", 409);
  if (draft.listingUrl || ["published", "sold", "archived"].includes(draft.status)) throw new MarketplaceError("Este producto ya tiene un aviso registrado. Abrilo desde su enlace.", 409);
  const { item, product } = await currentProduct(itemId); checkProduct(product, draft);
  if (!draft.condition || !draft.category) throw new MarketplaceError("Elegí categoría y estado antes de cargar en Facebook.");
  const photos = storePhotos(item).slice(0, 9).map((source, index) => ({ source, name: `plug-${itemId}-${index + 1}.jpg` }));
  // Bound both storage.session (10 MB) and extension messaging; galleries are never included in list responses.
  if (JSON.stringify(photos).length > 8 * 1024 * 1024) throw new MarketplaceError("Las fotos son demasiado grandes. Reducilas antes de enviarlas.");
  return { protocol: 1, handoffId: randomUUID(), itemId, sourceVersion: draft.sourceVersion, revision, createdAt: new Date().toISOString(), title: draft.title,
    description: draft.description, price: draft.price, condition: draft.condition, category: draft.category, location: draft.location, photos };
}
export async function setMarketplaceStatus(owner: string, itemId: string, revision: number, status: MarketplaceStatus, rawUrl?: unknown) {
  await ensureSchema();
  const listingUrl = status === "published" ? marketplaceListingUrl(rawUrl) : null;
  if (status === "published" || status === "sent") {
    const row = await getPool().query<Row>("SELECT * FROM plug_marketplace_drafts WHERE owner_id=$1 AND item_id=$2", [owner, itemId]);
    if (!row.rows[0]) throw new MarketplaceError("No se encontró el borrador.", 404);
    const { product } = await currentProduct(itemId); checkProduct(product, row.rows[0].details);
    if (status === "sent" && !["draft", "sent"].includes(row.rows[0].status)) throw new MarketplaceError("El aviso ya está registrado.", 409);
  }
  const r = await getPool().query<Row>(`UPDATE plug_marketplace_drafts SET status=$4,
    listing_url=CASE WHEN $4='published' THEN $5 ELSE listing_url END,
    sent_at=CASE WHEN $4='sent' THEN now() ELSE sent_at END,
    needs_update=CASE WHEN $4='published' THEN false ELSE needs_update END,revision=revision+1,updated_at=now()
    WHERE owner_id=$1 AND item_id=$2 AND revision=$3 RETURNING *`, [owner, itemId, revision, status, listingUrl]);
  if (!r.rows[0]) throw new MarketplaceError("La publicación cambió o no existe. Actualizá la lista.", 409);
  return map(r.rows[0]);
}
