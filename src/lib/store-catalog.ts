import { createHash } from "node:crypto";
import { getPool } from "./db";
import { loadStoreCredentials } from "./store-connection";
import { storeRequest, StoreApiError, ensureStoreLinks, getStoreCategories } from "./tiendanube-api";
import { catalogTarget, type CatalogChanges, type CatalogProduct } from "./store-catalog-plan";

type Raw = Record<string, any>;
const translated = (value: Raw | undefined) => value?.es || Object.values(value ?? {})[0] || "";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const categoryIds = (raw: Raw) => (raw.categories ?? []).map((c: any) => typeof c === "number" ? c : c.id);
export function catalogProduct(raw: Raw): CatalogProduct {
  const product: CatalogProduct = { id: raw.id, name: translated(raw.name), descriptionHtml: translated(raw.description),
    brand: raw.brand || "", categoryIds: categoryIds(raw), visibility: raw.visibility || (raw.published ? "visible" : "hidden"),
    updatedAt: raw.updated_at || "", version: "", variants: (raw.variants ?? []).map((v: Raw) => ({
      id: v.id, label: (v.values ?? []).map(translated).join(" / ") || "Única", sku: v.sku || "",
      price: Number(v.price), weight: Number(v.weight) || 0,
      promotionalPrice: v.promotional_price == null ? null : Number(v.promotional_price),
    })) };
  product.version = digest(product); return product;
}
export async function listStoreCatalog(page: number, search: string) {
  const connection = await loadStoreCredentials(); if (!connection) throw new StoreApiError("Conectá tu tienda", 503);
  const query = new URLSearchParams({ page: String(page), per_page: "30", sort_by: "created-at-descending", ...(search ? { q: search } : {}) });
  const products = await storeRequest<Raw[]>(`/products?${query}`, "GET", undefined, connection);
  await ensureStoreLinks();
  const links = await getPool().query("SELECT item_id,product_id FROM tiendanube_links WHERE store_id=$1 AND product_id IS NOT NULL", [connection.storeId]);
  return { storeId: connection.storeId, products: products.map(p => ({ ...catalogProduct(p), thumbnail: p.images?.[0]?.src || null, linkedItemId: links.rows.find(l => String(l.product_id) === String(p.id))?.item_id })), hasMore: products.length === 30 };
}

type Step = { variantId?: number; body: Raw; before: Raw };
function stepsFor(raw: Raw, target: CatalogProduct, changes: CatalogChanges): Step[] {
  const body: Raw = {}; const before: Raw = {};
  if (changes.name) { before.name = raw.name; body.name = { ...raw.name, es: target.name }; }
  if (changes.description !== undefined) { before.description = raw.description; body.description = { ...raw.description, es: target.descriptionHtml }; }
  if (changes.brand !== undefined) { before.brand = raw.brand || ""; body.brand = target.brand; }
  if (changes.categoryId) { before.categories = categoryIds(raw); body.categories = target.categoryIds; }
  if (changes.visibility) { before.published = Boolean(raw.published); body.published = changes.visibility === "visible"; }
  const steps: Step[] = Object.keys(body).length ? [{ body, before }] : [];
  for (const variant of target.variants) {
    const original = raw.variants.find((v: Raw) => v.id === variant.id);
    const body: Raw = {}; const before: Raw = {};
    if (changes.price) { before.price = Number(original.price); body.price = variant.price; }
    if (changes.weightKg !== undefined) { before.weight = Number(original.weight) || 0; body.weight = variant.weight; }
    if (changes.clearPromotion) { before.promotional_price = original.promotional_price == null ? null : Number(original.promotional_price); body.promotional_price = null; }
    if (Object.keys(body).length) steps.push({ variantId: variant.id, body, before });
  }
  return steps;
}
function fieldsOf(raw: Raw, step: Step) {
  const source = step.variantId ? raw.variants.find((v: Raw) => v.id === step.variantId) : raw;
  if (!source) throw new StoreApiError("Cambió una variante. Revisá el producto en Tiendanube", 409);
  return Object.fromEntries(Object.keys(step.body).map(key => [key, key === "categories" ? categoryIds(raw)
    : key === "price" || key === "weight" ? Number(source[key]) || 0
    : key === "promotional_price" ? source[key] == null ? null : Number(source[key])
    : key === "brand" ? source[key] || "" : source[key]]));
}
function canonical(value: any): any {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
let jobsSchema: Promise<void> | null = null;
async function ensureJobs() {
  if (!jobsSchema) jobsSchema = getPool().query(`CREATE TABLE IF NOT EXISTS tiendanube_catalog_jobs (
    store_id TEXT NOT NULL, operation_id UUID NOT NULL, product_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    plan JSONB NOT NULL, step INTEGER NOT NULL DEFAULT 0, result JSONB,
    PRIMARY KEY(store_id,operation_id,product_id))`).then(() => undefined).catch(e => { jobsSchema = null; throw e; });
  return jobsSchema;
}
export async function editStoreCatalog(input: { id: number; version: string; storeId: string; operationId: string; changes: CatalogChanges }) {
  const connection = await loadStoreCredentials();
  if (!connection || connection.storeId !== input.storeId) throw new StoreApiError("La tienda conectada cambió. Actualizá el catálogo antes de editar", 409);
  await ensureJobs();
  const client = await getPool().connect(); const lock = `tiendanube:product:${connection.storeId}:${input.id}`; let locked = false;
  const request = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    await new Promise(resolve => setTimeout(resolve, 550));
    return storeRequest<T>(path, method, body, connection);
  };
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [lock])).rows[0].locked;
    if (!locked) throw new StoreApiError("Este producto se está modificando. Reintentá cuando termine", 409);
    const hash = digest({ version: input.version, changes: input.changes });
    const values = [connection.storeId, input.operationId, String(input.id)];
    let job = (await client.query("SELECT * FROM tiendanube_catalog_jobs WHERE store_id=$1 AND operation_id=$2 AND product_id=$3", values)).rows[0];
    if (job && job.request_hash !== hash) throw new StoreApiError("La operación cambió. Generá una nueva vista previa", 409);
    if (job?.result) return job.result;
    const raw = await request<Raw>(`/products/${input.id}`);
    if (!job) {
      const current = catalogProduct(raw);
      if (current.version !== input.version) throw new StoreApiError("El producto cambió desde la vista previa. Actualizá el catálogo", 409);
      if (input.changes.categoryId && !(await getStoreCategories(connection)).some(c => c.id === input.changes.categoryId)) throw new StoreApiError("La categoría ya no existe en esta tienda", 422);
      const target = catalogTarget(current, input.changes);
      const plan = stepsFor(raw, target, input.changes);
      await client.query("INSERT INTO tiendanube_catalog_jobs(store_id,operation_id,product_id,request_hash,plan) VALUES($1,$2,$3,$4,$5)", [...values, hash, JSON.stringify(plan)]);
      job = { plan, step: 0 };
    }
    const plan = job.plan as Step[];
    // En reintentos se aceptan solamente los valores anteriores o los ya aplicados por este lote.
    for (const step of plan) {
      const fields = fieldsOf(raw, step);
      if (!equal(fields, step.before) && !equal(fields, step.body)) throw new StoreApiError("Hay cambios nuevos en Tiendanube. Revisá el producto antes de retomar este lote", 409);
    }
    for (let index = 0; index < plan.length; index++) {
      const step = plan[index];
      if (!equal(fieldsOf(raw, step), step.body)) {
        await request(`/products/${input.id}${step.variantId ? `/variants/${step.variantId}` : ""}`, "PUT", step.body);
      }
      await client.query("UPDATE tiendanube_catalog_jobs SET step=$4 WHERE store_id=$1 AND operation_id=$2 AND product_id=$3", [...values, index + 1]);
    }
    const product = catalogProduct(await request<Raw>(`/products/${input.id}`));
    const result = { product, complete: true };
    await client.query("UPDATE tiendanube_catalog_jobs SET result=$4 WHERE store_id=$1 AND operation_id=$2 AND product_id=$3", [...values, JSON.stringify(result)]);
    return result;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lock]).catch(() => undefined);
    client.release();
  }
}
