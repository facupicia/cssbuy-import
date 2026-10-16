import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { catalogTarget, parseCatalogChanges } from "../src/lib/store-catalog-plan";
import { catalogProduct, editStoreCatalog } from "../src/lib/store-catalog";
import { StoreApiError } from "../src/lib/tiendanube-api";
import { GET, POST } from "../src/app/api/tiendanube/catalog/route";

const raw = { id: 100, name: { es: "Remera Bape", en: "Bape tee" }, description: { es: "<p>Original con tabla</p>" },
  brand: "Bape", categories: [{ id: 12 }], published: true, visibility: "visible", updated_at: "2026-10-15T00:00:00Z",
  variants: [{ id: 1, sku: "S", values: [{ es: "S" }], price: "100.00", weight: "0.3", promotional_price: "90.00", stock: 7 },
    { id: 2, sku: "M", values: [{ es: "M" }], price: "200.00", weight: "0.4", promotional_price: null, stock: 2 }] };

test("vista previa de catálogo conserva diferencias por variante y campos no elegidos", () => {
  const original = catalogProduct(raw);
  const target = catalogTarget(original, parseCatalogChanges({ price: { mode: "percent", value: 10 }, name: { mode: "replace", find: "Remera", value: "Remerón" } }));
  assert.deepEqual(target.variants.map(v => v.price), [110, 220]);
  assert.equal(target.variants[0].promotionalPrice, 90);
  assert.equal(target.name, "Remerón Bape"); assert.equal(target.visibility, "visible");
  assert.equal(target.descriptionHtml, original.descriptionHtml); assert.equal(target.variants[0].weight, 0.3);
  assert.equal(original.variants[0].price, 100);
  const fixed = catalogTarget(original, parseCatalogChanges({ price: { mode: "fixed", value: 350 }, clearPromotion: true, description: '<script>texto</script>' }));
  assert.deepEqual(fixed.variants.map(v => v.price), [350, 350]);
  assert.equal(fixed.variants[0].promotionalPrice, null); assert.ok(!fixed.descriptionHtml.includes("<script>"));
  for (const changes of [{ stock: 1 }, { price: { mode: "percent", value: -100 } }, { price: { mode: "fixed", value: 0 } }, { categoryId: -1 }, { weightKg: Infinity }, { visibility: "unlisted" }]) assert.throws(() => parseCatalogChanges(changes));
});

test("edición recuperable: no repite porcentajes ni pisa stock ante respuesta perdida", async t => {
  const beforeEnv = { ...process.env };
  process.env.TIENDANUBE_STORE_ID = "99"; process.env.TIENDANUBE_ACCESS_TOKEN = "test-token"; process.env.TIENDANUBE_USER_AGENT = "test@example.com";
  let remote = structuredClone(raw); let job: any = null; let lostResponse = true; let locked = true;
  const writes: { id: number; body: any }[] = [];
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
    if (sql.startsWith("SELECT * FROM tiendanube_catalog_jobs")) return { rows: job ? [structuredClone(job)] : [] };
    if (sql.startsWith("INSERT INTO tiendanube_catalog_jobs")) job = { request_hash: values[3], plan: JSON.parse(values[4]), step: 0 };
    if (sql.includes("SET step=")) job.step = values[3];
    if (sql.includes("SET result=")) job.result = JSON.parse(values[3]);
    return { rows: [] };
  };
  t.mock.method(Pool.prototype, "query", query);
  t.mock.method(Pool.prototype, "connect", async () => ({ query, release() {} }));
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    assert.ok(url.startsWith("https://api.tiendanube.com/2025-03/99/products/100"));
    if (init?.method === "GET") return new Response(JSON.stringify(remote));
    const id = Number(url.split("/").at(-1)); const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ["price"]);
    writes.push({ id, body });
    Object.assign(remote.variants.find(v => v.id === id)!, body);
    remote.updated_at = "2026-10-15T00:01:00Z";
    if (id === 1 && lostResponse) { lostResponse = false; throw new Error("lost response"); }
    return new Response(JSON.stringify({ id }));
  });
  const input = { id: 100, storeId: "99", version: catalogProduct(raw).version,
    operationId: "12345678-1234-1234-1234-123456789abc", changes: parseCatalogChanges({ price: { mode: "percent", value: 10 } }) };
  try {
    await assert.rejects(() => editStoreCatalog(input), /no respondió/);
    assert.equal(Number(remote.variants[0].price), 110); assert.equal(Number(remote.variants[1].price), 200);
    const result = await editStoreCatalog(input);
    assert.equal(result.complete, true);
    assert.deepEqual(remote.variants.map(v => Number(v.price)), [110, 220]);
    assert.deepEqual(remote.variants.map(v => v.stock), [7, 2]);
    assert.equal(remote.variants[0].promotional_price, "90.00"); assert.equal(remote.published, true);
    assert.equal(writes.filter(w => w.id === 1).length, 1);
    await editStoreCatalog(input); assert.equal(writes.length, 2);
    await assert.rejects(() => editStoreCatalog({ ...input, changes: parseCatalogChanges({ price: { mode: "percent", value: 20 } }) }), e => e instanceof StoreApiError && e.status === 409);
    await assert.rejects(() => editStoreCatalog({ ...input, storeId: "otro" }), e => e instanceof StoreApiError && e.status === 409);
    job = null;
    await assert.rejects(() => editStoreCatalog(input), e => e instanceof StoreApiError && e.status === 409);
    locked = false;
    await assert.rejects(() => editStoreCatalog(input), e => e instanceof StoreApiError && e.status === 409);
  } finally { process.env = beforeEnv; }
});

test("catálogo exige sesión administrativa y origen propio", async () => {
  assert.equal((await GET(new Request("https://panel.example/api/tiendanube/catalog"))).status, 401);
  assert.equal((await POST(new Request("https://panel.example/api/tiendanube/catalog", { method: "POST", headers: { origin: "https://otro.example" }, body: "{}" }))).status, 403);
});
