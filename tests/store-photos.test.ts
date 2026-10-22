import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { syncStorePhotos, StoreApiError } from "../src/lib/tiendanube-api";
import { POST } from "../src/app/api/tiendanube/photos/route";
import { mockAccount } from "./helpers/account";

const id = "12345678-1234-1234-1234-123456789abc";
const version = "2026-10-22T12:00:00.000Z";
const firstPhoto = "https://example.com/first.jpg";
const secondPhoto = "data:image/jpeg;base64,Yg==";
const hash = (photo: string) => createHash("sha256").update(photo).digest("hex");

test("fotos: conserva producto, stock, precios y fotos externas; recupera una respuesta perdida", async t => {
  const before = { ...process.env };
  Object.assign(process.env, { TIENDANUBE_STORE_ID: "99", TIENDANUBE_ACCESS_TOKEN: "test-token", TIENDANUBE_USER_AGENT: "PLUG test" });
  let photos = [firstPhoto, secondPhoto], currentVersion = version, locked = true, lost = true, writes = 0, uploads = 0, lastPhotos = 0;
  let link: { product_id: string; images: Record<string, number> } | null = { product_id: "100", images: { [hash("removed")]: 103 } };
  const remote = {
    id: 100, name: { es: "Nombre en tienda" }, published: true, handle: { es: "url-existente" },
    variants: [{ id: 200, price: "69000", promotional_price: "62000", stock: 3, inventory_levels: [{ stock: 3 }], values: [] }], attributes: [],
    images: [{ id: 101, alt: { es: `Nombre anterior | PLUG ${hash(firstPhoto)}` }, position: 1 },
      { id: 103, alt: { es: `Anterior | PLUG ${hash("removed")}` }, position: 2 },
      { id: 999, alt: { es: "Foto cargada por el comerciante" }, position: 3 }],
  };
  const original = JSON.parse(JSON.stringify({ ...remote, images: [] }));
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
    if (sql.startsWith("SELECT") && sql.includes("FROM inventory_items")) return { rows: [{ id, nombre: "Nombre actualizado", sku: "PHOTO-1", variante: "", cantidad_inicial: 1, cantidad_vendida: 0,
      costo_unit_ars: 0, costo_unit_usd: 0, precio_venta_ars: 0, estado: "en_transito", origen: "manual", talles: null,
      tienda: { fotos: photos, descripcion: "", categoria: "", categoriaId: null, pesoKg: 1 }, created_at: new Date(version), updated_at: new Date(currentVersion) }] };
    if (sql.startsWith("SELECT * FROM tiendanube_links")) return { rows: link ? [{ ...link, images: { ...link.images } }] : [] };
    if (sql.startsWith("INSERT INTO tiendanube_links")) { link = { product_id: String(values[2]), images: {} }; return { rows: [{ product_id: link.product_id }] }; }
    if (sql.includes("SET images=")) link!.images = JSON.parse(String(values[2]));
    if (sql.includes("SET photos_synced_at=")) lastPhotos++;
    return { rows: [] };
  };
  t.mock.method(Pool.prototype, "query", query);
  t.mock.method(Pool.prototype, "connect", async () => ({ query, release() {} }));
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname.replace("/2025-03/99", "");
    if (init?.method === "GET") { assert.equal(path, "/products/100"); return Response.json(remote); }
    assert.match(path, /^\/products\/100\/images(?:\/\d+)?$/);
    writes++;
    const data = init?.body ? JSON.parse(String(init.body)) : null;
    if (init?.method === "POST") {
      assert.equal(path, "/products/100/images");
      assert.equal(data.attachment, "Yg=="); assert.ok(data.seo.es.alt.includes(hash(secondPhoto)));
      uploads++; remote.images.push({ id: 400 + uploads, alt: { es: data.seo.es.alt }, position: data.position });
      if (lost) throw new Error("lost response");
      return Response.json({ id: 400 + uploads });
    }
    if (init?.method === "PUT") { remote.images.find(image => String(image.id) === path.split("/").pop())!.position = data.position; return Response.json({}); }
    assert.equal(init?.method, "DELETE");
    assert.ok(!path.endsWith("/999"), "never remove merchant images");
    remote.images = remote.images.filter(image => String(image.id) !== path.split("/").pop());
    return new Response(null, { status: 204 });
  });
  const run = (updatedAt = version, productId = "100", storeId = "99") => syncStorePhotos(id, updatedAt, productId, storeId);
  const conflict = (error: unknown) => error instanceof StoreApiError && error.status === 409;
  try {
    await assert.rejects(() => run(version, "100", "88"), conflict);
    await assert.rejects(() => run("stale"), conflict);
    await assert.rejects(() => run(version, "111"), conflict);
    locked = false; await assert.rejects(() => run(), conflict); locked = true;
    const saved = link; link = null; await assert.rejects(() => run(), conflict); link = saved;
    const savedPhotos = photos; photos = []; await assert.rejects(() => run(), error => error instanceof StoreApiError && error.status === 422); photos = savedPhotos;
    assert.equal(writes, 0);
    await assert.rejects(() => run(), /no respondió/);
    assert.equal(uploads, 1); assert.equal(lastPhotos, 0);
    lost = false;
    const result = await run();
    assert.equal(uploads, 1, "lost image POST is recovered via multilingual alt marker");
    assert.equal(result.removed, 1); assert.equal(lastPhotos, 1);
    assert.ok(remote.images.some(image => image.id === 999));
    assert.ok(!remote.images.some(image => image.id === 103));
    assert.deepEqual({ ...remote, images: [] }, original);
    const beforeRetry = writes; await run(); assert.equal(writes, beforeRetry, "unchanged images need no remote writes");
    link = null;
    const uploadsBeforeLink = uploads;
    await syncStorePhotos(id, version, "100", "99", true);
    assert.equal(link!.product_id, "100");
    assert.equal(uploads, uploadsBeforeLink);
    assert.deepEqual({ ...remote, images: [] }, original);
    currentVersion = "2026-10-23T12:00:00.000Z";
    await assert.rejects(() => run(), conflict);
  } finally { process.env = before; }
});

test("endpoint de fotos exige cuenta y origen y rechaza campos ajenos a la actualización", async t => {
  const previous = process.env.BUSINESS_APP_ORIGIN;
  process.env.BUSINESS_APP_ORIGIN = "https://panel.example";
  const cookie = mockAccount(t);
  const request = (origin = "https://panel.example", value = cookie, body: unknown = {}) => new Request("https://panel.example/api/tiendanube/photos", {
    method: "POST", headers: { origin, cookie: value, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await POST(request("https://panel.example", ""))).status, 401);
    assert.equal((await POST(request("https://evil.example"))).status, 403);
    assert.equal((await POST(request())).status, 400);
    assert.equal((await POST(request("https://panel.example", cookie, null))).status, 400);
    assert.equal((await POST(request("https://panel.example", cookie, { id, updatedAt: version, productId: "100", storeId: "99", stock: 999 }))).status, 400);
  } finally { if (previous === undefined) delete process.env.BUSINESS_APP_ORIGIN; else process.env.BUSINESS_APP_ORIGIN = previous; }
});
