import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import sharp from "sharp";
import { mockAccount } from "./helpers/account";
import { isInventoryPhotoUrl } from "../src/lib/inventory-media";
import { sanitizeStoreProfile, storeReadiness, validPhoto } from "../src/lib/store-product";
import type { InventoryItem } from "../src/lib/types";

test("inventario liviano con PostgreSQL: mide reducción, conserva originales y sirve imágenes privadas", { timeout: 120_000 }, async t => {
  const before = { ...process.env };
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  const directory = await mkdtemp(join(tmpdir(), "plug-media-test-"));
  const database = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "local-test-only", persistent: false,
    onLog: () => {}, onError: () => {}, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  let pool: import("pg").Pool | undefined;
  try {
    await database.initialise(); await database.start();
    Object.assign(process.env, { PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGPASSWORD: "local-test-only", PGDATABASE: "postgres", BUSINESS_APP_ORIGIN: "https://panel.example" });
    const db = await import("../src/lib/db"); pool = db.getPool();
    const { newStoreProfile } = await import("../src/lib/store-defaults");
    const photos = await Promise.all([0, 1, 2].map(async () => "data:image/jpeg;base64," + (await sharp(randomBytes(640 * 640 * 3), { raw: { width: 640, height: 640, channels: 3 } }).jpeg({ quality: 88 }).toBuffer()).toString("base64")));
    const created: InventoryItem[] = [];
    for (let i = 0; i < 5; i++) created.push(await db.insertInventoryItem({ nombre: `Producto de prueba ${i}`, cantidadInicial: 1, cantidadVendida: 0, costoUnitARS: 20000, precioVentaARS: 70000,
      estado: "en_deposito", origen: "manual", imagen: photos[0], tienda: { ...newStoreProfile(), descripcion: "Prueba", categoria: "Remeras", categoriaId: 1, pesoKg: 0.2, fotos: photos } }));
    const start = performance.now();
    const full = await db.getInventoryItems();
    const legacyMs = performance.now() - start;
    const nextStart = performance.now();
    const summary = await db.getInventoryItems({ media: "urls" });
    const lightMs = performance.now() - nextStart;
    const legacyBytes = Buffer.byteLength(JSON.stringify({ items: full }));
    const lightBytes = Buffer.byteLength(JSON.stringify({ items: summary }));
    console.log(JSON.stringify({ fixture: "5 products with 3 photos each; not production", legacyBytes, lightBytes,
      reductionPercent: Number((100 * (1 - lightBytes / legacyBytes)).toFixed(2)), legacyMs: Math.round(legacyMs), lightMs: Math.round(lightMs) }));
    assert.ok(lightBytes < legacyBytes * 0.05);
    assert.ok(!JSON.stringify(summary).includes("data:image"));
    assert.equal(summary[0].tienda!.fotos.length, 3);
    assert.ok(summary[0].tienda!.fotos.every(isInventoryPhotoUrl));
    assert.match(summary[0].imagen!, /size=thumb/);
    assert.equal(storeReadiness(summary[0], "PLUG").errors.some(error => error.includes("fotos")), false);
    assert.equal(validPhoto(summary[0].tienda!.fotos[0]), false, "private read URLs cannot be saved as originals");
    assert.throws(() => sanitizeStoreProfile(summary[0].tienda));
    assert.equal((await db.getInventoryItems({ media: "none" }))[0].imagen, null);
    assert.deepEqual((await db.getInventoryItem(created[0].id))!.tienda!.fotos, photos);

    const cookie = mockAccount(t);
    const image = await import("../src/app/api/inventario/[id]/photos/[index]/route");
    const list = await import("../src/app/api/inventario/route");
    const detail = await import("../src/app/api/inventario/[id]/route");
    const item = summary.find(row => row.id === created[0].id)!;
    const path = item.tienda!.fotos[0];
    const req = (url: string, supplied = cookie, extra: Record<string, string> = {}) => new Request(`https://panel.example${url}`, { headers: { cookie: supplied, ...extra } });
    const context = { params: Promise.resolve({ id: item.id, index: "0" }) };
    assert.equal((await image.GET(req(path, ""), context)).status, 401);
    assert.equal((await image.GET(req(path), { params: Promise.resolve({ id: item.id, index: "9" }) })).status, 404);
    const original = await image.GET(req(path), context);
    assert.equal(original.status, 200);
    assert.equal(original.headers.get("content-type"), "image/jpeg");
    assert.match(original.headers.get("cache-control")!, /private/);
    assert.equal(original.headers.get("vary"), "Cookie");
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), Buffer.from(photos[0].split(",")[1], "base64"));
    const thumbnail = await image.GET(req(item.imagen!), context);
    assert.equal(thumbnail.headers.get("content-type"), "image/webp");
    const bytes = Buffer.from(await thumbnail.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).width, 256);
    assert.ok(bytes.length < Buffer.from(photos[0].split(",")[1], "base64").length);
    assert.equal((await image.GET(req(item.imagen!, cookie, { "if-none-match": thumbnail.headers.get("etag")! }), context)).status, 304);
    const response = await list.GET(req("/api/inventario"));
    assert.ok(!(await response.text()).includes("data:image"));
    const record = await detail.GET(req(`/api/inventario/${item.id}`), { params: Promise.resolve({ id: item.id }) });
    assert.deepEqual((await record.json()).item.tienda.fotos, photos);
    const edit = await detail.PATCH(new Request(`https://panel.example/api/inventario/${item.id}`, { method: "PATCH", headers: { cookie, origin: "https://panel.example", "content-type": "application/json" }, body: JSON.stringify({ precioVentaARS: 72000 }) }), { params: Promise.resolve({ id: item.id }) });
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).item.mediaDeferred, true);
    assert.deepEqual((await db.getInventoryItem(item.id))!.tienda!.fotos, photos);

    const fallback = await db.insertInventoryItem({ nombre: "Solo enlace externo", imagen: "https://example.com/photo.jpg", cantidadInicial: 1, cantidadVendida: 0, precioVentaARS: 50000, costoUnitARS: 10000, estado: "en_deposito", origen: "manual" });
    assert.equal((await db.getInventoryItems({ media: "urls" })).find(row => row.id === fallback.id)!.tienda!.fotos.length, 1);
    const redirect = await image.GET(req(`/api/inventario/${fallback.id}/photos/0`), { params: Promise.resolve({ id: fallback.id, index: "0" }) });
    assert.equal(redirect.status, 302); assert.equal(redirect.headers.get("location"), "https://example.com/photo.jpg");
  } finally {
    if (pool) await pool.end();
    await database.stop(); process.env = before;
  }
});
