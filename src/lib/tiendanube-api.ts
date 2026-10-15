import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureSchema, getInventoryItem, getInventoryItems, getMarcas, getPool } from "./db";
import { storePhotos, storeReadiness, storeVariants } from "./store-product";
import { generarDescripcionTiendaHTML } from "./descripcion";
import { loadStoreCredentials, type StoreCredentials } from "./store-connection";

export class StoreApiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export async function storeRequest<T>(path: string, method = "GET", body?: unknown, connection?: StoreCredentials): Promise<T> {
  const credentials = connection ?? await loadStoreCredentials();
  if (!credentials) throw new StoreApiError("Conectá tu Tiendanube desde el panel para continuar", 503);
  let response: Response;
  try {
    response = await fetch(`https://api.tiendanube.com/2025-03/${credentials.storeId}${path}`, {
      method, headers: { Authorization: `Bearer ${credentials.token}`, "User-Agent": credentials.userAgent, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", signal: AbortSignal.timeout(25000), redirect: "error",
    });
  } catch { throw new StoreApiError("Tiendanube no respondió a tiempo. Reintentá: se verificará el producto existente antes de crearlo"); }
  if (!response.ok) {
    const labels: Record<number, string> = { 401: "Credenciales de Tiendanube inválidas", 403: "La aplicación necesita permisos de lectura y escritura de productos", 404: "No se encontró el recurso en Tiendanube. Revisá el vínculo antes de reintentar", 422: "Tiendanube rechazó los datos. Revisá categorías, variantes, peso y fotos", 429: "Tiendanube alcanzó su límite de solicitudes. Esperá un minuto y reintentá" };
    throw new StoreApiError(labels[response.status] ?? "Tiendanube no pudo completar la operación", response.status === 429 ? 429 : 502);
  }
  return response.json() as Promise<T>;
}

type Translation = Record<string, string>;
export interface RemoteVariant { id: number; sku: string; values: Translation[] }
export interface RemoteProduct { id: number; variants: RemoteVariant[]; attributes: Translation[]; images: { id: number; alt?: string }[]; published: boolean; handle: Translation }
export interface StoreLink { product_id: string | null; synced_at: string | null; visibility: string | null; error: string | null }

let schema: Promise<void> | null = null;
export async function ensureStoreLinks() {
  if (!schema) schema = ensureSchema().then(async () => {
    await getPool().query(`CREATE TABLE IF NOT EXISTS tiendanube_links (
      store_id TEXT NOT NULL, item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      product_id TEXT, synced_at TIMESTAMPTZ, visibility TEXT, error TEXT,
      images JSONB NOT NULL DEFAULT '{}'::jsonb, PRIMARY KEY (store_id, item_id), UNIQUE (store_id, product_id))`);
  }).catch(e => { schema = null; throw e; });
  return schema;
}
export async function getStoreLinks(): Promise<Record<string, StoreLink>> {
  const credentials = await loadStoreCredentials();
  if (!credentials) return {};
  await ensureStoreLinks();
  const result = await getPool().query("SELECT item_id, product_id, synced_at, visibility, error FROM tiendanube_links WHERE store_id=$1", [credentials.storeId]);
  return Object.fromEntries(result.rows.map(r => [r.item_id, r]));
}
export async function getStoreCategories() {
  const credentials = await loadStoreCredentials();
  if (!credentials) throw new StoreApiError("Conectá tu Tiendanube para cargar las categorías", 503);
  const all: { id: number; name: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const rows = await storeRequest<{ id: number; name: Translation }[]>(`/categories?per_page=200&page=${page}`, "GET", undefined, credentials);
    all.push(...rows.map(c => ({ id: c.id, name: c.name.es || Object.values(c.name)[0] || String(c.id) })));
    if (rows.length < 200) return all;
  }
  throw new StoreApiError("La tienda tiene demasiadas categorías para cargar en una sola consulta");
}

const translated = (v: Translation) => v.es || Object.values(v)[0] || "";
export function variantKey(values: string[]) { return JSON.stringify(values.map(s => s.trim().toLowerCase())); }
async function saveLink(client: PoolClient, itemId: string, productId: number, storeId: string) {
  await client.query("UPDATE tiendanube_links SET product_id=$3 WHERE store_id=$1 AND item_id=$2", [storeId, itemId, String(productId)]);
}

/** Session advisory lock spans remote I/O. Each acknowledged remote ID is committed immediately. */
export async function syncStoreProduct(itemId: string, publish: boolean, expectedUpdatedAt: string, expectedProductId?: string, expectedStoreId?: string) {
  const credentials = await loadStoreCredentials();
  if (!credentials) throw new StoreApiError("Conectá tu Tiendanube antes de enviar productos", 503);
  if (expectedStoreId && expectedStoreId !== credentials.storeId) throw new StoreApiError("La tienda conectada cambió desde la vista previa. Actualizá antes de enviar", 409);
  const request = <T>(path: string, method = "GET", body?: unknown) => storeRequest<T>(path, method, body, credentials);
  await ensureStoreLinks();
  const client = await getPool().connect();
  const lock = `tiendanube:${credentials.storeId}:${itemId}`;
  let locked = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [lock]);
    locked = result.rows[0].locked;
    if (!locked) throw new StoreApiError("Este producto ya se está enviando. Esperá a que termine", 409);
    const item = await getInventoryItem(itemId);
    if (!item) throw new StoreApiError("Producto no encontrado", 404);
    if (item.updatedAt !== expectedUpdatedAt) throw new StoreApiError("El producto cambió desde la vista previa. Actualizá antes de enviarlo", 409);
    const brand = (await getMarcas()).find(m => m.id === item.marcaId)?.nombre;
    const readiness = storeReadiness(item, brand);
    if (!readiness.ready) throw new StoreApiError(readiness.errors.join(". "), 422);
    if (!item.tienda?.categoriaId) throw new StoreApiError("Seleccioná una categoría de Tiendanube en la ficha", 422);
    const variants = storeVariants(item);
    const skuSet = new Set(variants.map(v => v.sku));
    const duplicate = (await getInventoryItems()).find(other => other.id !== item.id && storeVariants(other).some(v => skuSet.has(v.sku)));
    if (duplicate) throw new StoreApiError(`Hay SKU compartidos con ${duplicate.nombre}. Corregilos antes de enviar`, 422);
    const attributes = variants[0].props.map(p => ({ es: p.nombre }));
    const stockBody = (stock: number) => ({ inventory_levels: [{ stock, ...(credentials.locationId ? { location_id: credentials.locationId } : {}) }] });
    const variantBody = (v: typeof variants[number]) => ({ sku: v.sku, price: v.price, weight: v.weight, promotional_price: null, ...stockBody(v.stock), values: v.props.map(p => ({ es: p.valor })) });
    const metadata = { name: { es: item.nombre.trim() }, description: { es: generarDescripcionTiendaHTML(item, brand) }, brand,
      categories: [item.tienda.categoriaId], requires_shipping: true };
    await client.query("INSERT INTO tiendanube_links (store_id,item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [credentials.storeId, itemId]);
    const link = (await client.query("SELECT * FROM tiendanube_links WHERE store_id=$1 AND item_id=$2", [credentials.storeId, itemId])).rows[0];
    let remote: RemoteProduct;
    let recovered = false;
    if (link.product_id) remote = await request<RemoteProduct>(`/products/${link.product_id}`);
    else {
      // A deterministic handle also recovers a successful POST whose response was lost.
      let found = await request<RemoteProduct[]>(`/products?handle=plug-${itemId}`);
      if (!found.length && item.sku) {
        const candidates = await request<RemoteProduct[]>(`/products?q=${encodeURIComponent(item.sku)}&per_page=200`);
        found = candidates.filter(p => p.variants.some(v => skuSet.has(v.sku)));
      }
      if (found.length > 1) throw new StoreApiError("Hay varios productos con el identificador de este ítem. Revisá el vínculo", 409);
      if (found.length) { remote = found[0]; recovered = true; }
      else remote = await request<RemoteProduct>("/products", "POST", { ...metadata, handle: { es: `plug-${itemId}` }, attributes,
        variants: variants.map(variantBody), published: false });
      await saveLink(client, itemId, remote.id, credentials.storeId);
    }
    // When adopting an existing ID, the user must have previewed the link first.
    if ((recovered || link.product_id) && String(remote.id) !== expectedProductId) throw new StoreApiError("Se encontró el producto existente y se guardó su vínculo. Actualizá la vista previa antes de modificarlo", 409);
    if (variantKey((remote.attributes ?? []).map(translated)) !== variantKey(attributes.map(translated))) throw new StoreApiError("Cambió la estructura de variantes. Conservá los mismos atributos para actualizar este producto", 409);
    // Hide while updating so an interrupted operation cannot publish an incomplete product.
    await request(`/products/${remote.id}`, "PUT", { ...metadata, published: false });
    await client.query("UPDATE tiendanube_links SET visibility='hidden' WHERE store_id=$1 AND item_id=$2", [credentials.storeId, itemId]);
    for (const v of variants) {
      const key = variantKey(v.props.map(p => p.valor));
      const matches = remote.variants.filter(r => variantKey(r.values.map(translated)) === key);
      if (matches.length > 1) throw new StoreApiError("Variantes duplicadas en Tiendanube: revisá el producto", 409);
      if (matches.length) await request(`/products/${remote.id}/variants/${matches[0].id}`, "PUT", variantBody(v));
      else await request(`/products/${remote.id}/variants`, "POST", variantBody(v));
    }
    // Removed sizes remain in the store at zero stock, preserving their identity/history.
    const keys = new Set(variants.map(v => variantKey(v.props.map(p => p.valor))));
    for (const v of remote.variants) if (!keys.has(variantKey(v.values.map(translated)))) await request(`/products/${remote.id}/variants/${v.id}`, "PUT", stockBody(0));
    const imageMap: Record<string, number> = link.images ?? {};
    const desired = new Set<string>();
    for (const [position, photo] of storePhotos(item).entries()) {
      const hash = createHash("sha256").update(photo).digest("hex");
      desired.add(hash);
      // Alt marker recovers an image POST whose response was lost.
      const marker = `${item.nombre} | PLUG ${hash}`;
      const mapped = imageMap[hash];
      const existing = (remote.images?.some(i => i.id === mapped) ? mapped : undefined)
        ?? remote.images?.find(i => i.alt === marker)?.id;
      if (existing) {
        imageMap[hash] = existing;
        await request(`/products/${remote.id}/images/${existing}`, "PUT", { position: position + 1 });
      } else {
        const data = photo.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
        const image = await request<{ id: number }>(`/products/${remote.id}/images`, "POST", { position: position + 1, alt: marker,
          ...(data ? { attachment: data[2], filename: `producto.${data[1] === "jpeg" ? "jpg" : data[1]}` } : { src: photo }) });
        imageMap[hash] = image.id;
      }
      await client.query("UPDATE tiendanube_links SET images=$3 WHERE store_id=$1 AND item_id=$2", [credentials.storeId, itemId, JSON.stringify(imageMap)]);
    }
    for (const [hash, id] of Object.entries(imageMap)) if (!desired.has(hash)) {
      if (remote.images?.some(i => i.id === id)) await request(`/products/${remote.id}/images/${id}`, "DELETE");
      delete imageMap[hash];
      await client.query("UPDATE tiendanube_links SET images=$3 WHERE store_id=$1 AND item_id=$2", [credentials.storeId, itemId, JSON.stringify(imageMap)]);
    }
    const current = await getInventoryItem(itemId);
    if (current?.updatedAt !== item.updatedAt) throw new StoreApiError("El producto cambió durante el envío. Quedó oculto: revisá la vista previa y reintentá", 409);
    await request(`/products/${remote.id}`, "PUT", { published: publish });
    await client.query("UPDATE tiendanube_links SET synced_at=now(), visibility=$3, error=NULL WHERE store_id=$1 AND item_id=$2", [credentials.storeId, itemId, publish ? "visible" : "hidden"]);
    return { productId: remote.id, published: publish };
  } catch (error) {
    if (locked) await client.query("UPDATE tiendanube_links SET error=$3 WHERE store_id=$1 AND item_id=$2", [credentials.storeId, itemId, error instanceof StoreApiError ? error.message : "Error al enviar el producto. Reintentá desde la vista previa"]).catch(() => undefined);
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lock]).catch(() => undefined);
    client.release();
  }
}
