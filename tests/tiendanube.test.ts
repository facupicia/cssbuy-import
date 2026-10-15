import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { sanitizeStoreProfile, storeReadiness, storeVariants, publicDescription, EMPTY_STORE_PROFILE } from "../src/lib/store-product";
import { buildTiendanubeCSV } from "../src/lib/tiendanube";
import { sanitizeInventoryInput } from "../src/lib/inventory";
import { generarDescripcionTiendaHTML } from "../src/lib/descripcion";
import { tablaDeMarca } from "../src/lib/tablas-talle";
import { storeSession, storeAuthenticated, storeGuard } from "../src/lib/store-auth";
import { syncStoreProduct, StoreApiError, storeRequest } from "../src/lib/tiendanube-api";
import { POST as syncRoute } from "../src/app/api/tiendanube/route";
import type { InventoryItem } from "../src/lib/types";

const item: InventoryItem = {
  id: "12345678-1234-1234-1234-123456789abc", nombre: "Campera negra", sku: "CAMP-1", variante: "Color:Negro",
  cantidadInicial: 5, cantidadVendida: 1, costoUnitARS: 20000, costoUnitUSD: 0, precioVentaARS: 45000,
  estado: "en_deposito", origen: "manual", createdAt: "2026-10-15T12:00:00.000Z", updatedAt: "2026-10-15T12:00:00.000Z",
  notas: "NOTA PRIVADA", marcaId: "marca", talles: [
    { talle: "M", cantidadInicial: 3, cantidadVendida: 1, sku: "CAMP-M" },
    { talle: "L", cantidadInicial: 2, cantidadVendida: 2, sku: "CAMP-L" },
  ], tienda: { ...EMPTY_STORE_PROFILE, descripcion: "Algodón <script>alert(1)</script>\nCalce regular", categoria: "Camperas", categoriaId: 12,
    pesoKg: 0.6, descuentoPct: 10, redondearA: 100, fotos: ["https://example.com/campera.jpg"] },
};
test("la ficha y la exportación conservan la tabla de la marca junto con la descripción pública", () => {
  const bape = { ...item, nombre: "Remera Bape", talles: null, variante: "Color:Negro;Tamaño:2XL" };
  assert.equal(tablaDeMarca(" BAPE ")?.marca, "Bape");
  for (const profile of [bape, { ...bape, tienda: null }]) {
    const html = generarDescripcionTiendaHTML(profile, "Bape");
    assert.ok(html.includes("Tabla de talles · Bape"));
    assert.ok(html.includes("XXL"));
    assert.ok(!html.includes("NOTA PRIVADA"));
    if (profile.tienda) assert.ok(html.includes("&lt;script&gt;"));
  }
  const csv = buildTiendanubeCSV([bape], { nombreDeMarca: { marca: "Bape" } }).csv;
  assert.ok(csv.includes("Tabla de talles · Bape"));
  assert.ok(!csv.includes("NOTA PRIVADA"));
  assert.ok(generarDescripcionTiendaHTML(bape, "Supreme").includes("Tabla de talles · Supreme"));
  assert.ok(!generarDescripcionTiendaHTML(bape, "Sin tabla").includes("Tabla de talles · Bape"));
});
test("validación y precios: mantiene talles agotados, bloquea datos incoherentes y separa las notas", () => {
  assert.equal(EMPTY_STORE_PROFILE.descuentoPct, 10);
  assert.equal(sanitizeStoreProfile({}).descuentoPct, 10);
  assert.equal(sanitizeStoreProfile({ descuentoPct: 0 }).descuentoPct, 0);
  assert.equal(storeVariants({ ...item, tienda: null })[0].price, 50000);
  assert.equal(storeReadiness(item, "PLUG").ready, true);
  const variants = storeVariants(item);
  assert.deepEqual(variants.map(v => v.stock), [2, 0]);
  assert.equal(variants[0].price, 50000);
  assert.deepEqual(variants[0].props.map(p => p.nombre), ["Talle", "Color"]);
  assert.equal(storeReadiness({ ...item, tienda: null }, "PLUG").ready, false);
  assert.equal(storeReadiness({ ...item, cantidadVendida: 10, talles: null }, "PLUG").ready, false);
  assert.equal(storeReadiness({ ...item, cantidadInicial: 2.5, talles: null }, "PLUG").ready, false);
  assert.equal(storeReadiness({ ...item, estado: "en_transito" }, "PLUG").ready, false);
  const csv = buildTiendanubeCSV([item]).csv;
  assert.ok(csv.includes("50000"));
  assert.ok(csv.includes("&lt;script&gt;"));
  assert.ok(!csv.includes("NOTA PRIVADA"));
  assert.ok(!buildTiendanubeCSV([{ ...item, tienda: null }]).csv.includes("NOTA PRIVADA"));
  assert.ok(!publicDescription(item.tienda!.descripcion).includes("<script>"));
  assert.deepEqual(sanitizeInventoryInput({ tienda: item.tienda }).tienda, item.tienda);
  assert.throws(() => sanitizeStoreProfile({ ...item.tienda, fotos: ["javascript:alert(1)"] }));
  assert.throws(() => sanitizeStoreProfile({ ...item.tienda, fotos: ["https://user:pass@example.com/a.jpg"] }));
  assert.throws(() => sanitizeStoreProfile({ ...item.tienda, descuentoPct: 100 }));
  assert.throws(() => sanitizeStoreProfile({ ...item.tienda, categoriaId: -1 }));
});

test("descripción automática válida aunque exista una ficha con texto vacío", () => {
  for (const descripcion of ["", " \n\t "]) {
    const automatic = { ...item, nombre: "Remera Bape", tienda: { ...item.tienda!, descripcion } };
    assert.equal(storeReadiness(automatic, "Bape").ready, true);
    const html = generarDescripcionTiendaHTML(automatic, "Bape");
    assert.ok(html.includes("Remera Bape"));
    assert.ok(html.includes("Tabla de talles · Bape"));
    assert.ok(html.includes("Cómo saber tu talle"));
    assert.ok(!html.includes("NOTA PRIVADA"));
    assert.equal(html, generarDescripcionTiendaHTML({ ...automatic, tienda: null }, "Bape"));
    assert.ok(buildTiendanubeCSV([automatic], { nombreDeMarca: { marca: "Bape" } }).csv.includes("Cómo saber tu talle"));
  }
});

test("sesión de escritura independiente, origen y contrato de credenciales", async () => {
  const before = { ...process.env };
  try {
    process.env.ADMIN_PASSWORD = "clave-de-administracion-segura";
    process.env.BUSINESS_APP_ORIGIN = "https://panel.example";
    const cookie = `store_session=${storeSession(process.env.ADMIN_PASSWORD)}`;
    const req = (origin: string, value = cookie) => new Request("https://panel.example/api/tiendanube", { method: "POST", headers: { origin, cookie: value } });
    assert.equal(storeGuard(req("https://panel.example")), null);
    assert.equal(storeGuard(req("https://evil.example"))?.status, 403);
    assert.equal(storeAuthenticated(req("https://panel.example", `reporting_session=${storeSession(process.env.ADMIN_PASSWORD)}`)), false);
    assert.equal(storeAuthenticated(req("https://panel.example", `store_session=${storeSession(process.env.ADMIN_PASSWORD, Date.now() - 1000)}`)), false);
    assert.equal((await syncRoute(req("https://panel.example", ""))).status, 401);
    const invalid = new Request("https://panel.example/api/tiendanube", { method: "POST", headers: { origin: "https://panel.example", cookie }, body: JSON.stringify({ id: item.id, publish: "yes" }) });
    assert.equal((await syncRoute(invalid)).status, 400);
  } finally { process.env = before; }
});

test("envíos recuperables: creación, actualización por ID, SKU existente y respuesta perdida", async (t) => {
  const before = { ...process.env };
  process.env.TIENDANUBE_STORE_ID = "99";
  process.env.TIENDANUBE_ACCESS_TOKEN = "private-token";
  process.env.TIENDANUBE_USER_AGENT = "PLUG (test@example.com)";
  let link: Record<string, unknown> | null = null;
  let remote: Record<string, any> | null = null;
  let lostResponse = false;
  let creations = 0;
  let images = 0;
  let unavailable = false;
  let locked = true;
  const toRow = () => ({ id: item.id, nombre: item.nombre, sku: item.sku, variante: item.variante, cantidad_inicial: item.cantidadInicial,
    cantidad_vendida: item.cantidadVendida, costo_unit_ars: item.costoUnitARS, costo_unit_usd: 0, precio_venta_ars: item.precioVentaARS,
    estado: item.estado, origen: item.origen, marca_id: item.marcaId, talles: item.talles, tienda: item.tienda,
    created_at: new Date(item.createdAt), updated_at: new Date(item.updatedAt) });
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
    if (sql.startsWith("SELECT") && sql.includes("FROM inventory_items")) return { rows: [toRow()] };
    if (sql.includes("FROM marcas ORDER")) return { rows: [{ id: "marca", nombre: "PLUG", activa: true, created_at: new Date() }] };
    if (sql.startsWith("INSERT INTO tiendanube_links")) link ??= { product_id: null, images: {} };
    if (sql.startsWith("SELECT * FROM tiendanube_links")) return { rows: [{ ...link }] };
    if (sql.includes("SET product_id=")) link!.product_id = values[2];
    if (sql.includes("SET images=")) link!.images = JSON.parse(values[2]);
    return { rows: [] };
  };
  t.mock.method(Pool.prototype, "query", query);
  t.mock.method(Pool.prototype, "connect", async () => ({ query, release() {} }));
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    assert.ok(input.startsWith("https://api.tiendanube.com/2025-03/99/"));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer private-token");
    const path = new URL(input).pathname.replace("/2025-03/99", "");
    const data = init?.body ? JSON.parse(String(init.body)) : null;
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (path === "/categories") return ok([{ id: 12, name: { es: "Camperas" } }]);
    if (unavailable) return new Response("", { status: 429 });
    if (path === "/products" && init?.method === "GET") {
      const handle = new URL(input).searchParams.get("handle");
      return ok(remote && (!handle || remote.handle.es === handle) ? [remote] : []);
    }
    if (path === "/products" && init?.method === "POST") {
      creations++;
      remote = { ...data, id: 100, images: [], variants: data.variants.map((v: any, i: number) => ({ ...v, id: 200 + i })) };
      if (lostResponse) throw new Error("lost response");
      return ok(remote);
    }
    if (path === "/products/100" && init?.method === "GET") return ok(remote);
    if (path === "/products/100" && init?.method === "PUT") { Object.assign(remote!, data); return ok(remote); }
    if (path.startsWith("/products/100/variants/")) { Object.assign(remote!.variants.find((v: any) => v.id === Number(path.split("/").pop())), data); return ok({}); }
    if (path === "/products/100/images" && init?.method === "POST") { images++; const img = { ...data, id: 300 }; remote!.images.push(img); return ok(img); }
    if (path === "/products/100/images/300") return ok({ id: 300 });
    throw new Error(`Unexpected request ${init?.method} ${path}`);
  });
  try {
    await syncStoreProduct(item.id, false, item.updatedAt);
    await assert.rejects(() => syncStoreProduct(item.id, true, item.updatedAt, "100", "another-store"), e => e instanceof StoreApiError && e.status === 409);
    assert.equal(creations, 1); assert.equal(images, 1); assert.equal(remote!.published, false);
    await syncStoreProduct(item.id, true, item.updatedAt, "100");
    assert.equal(creations, 1); assert.equal(images, 1); assert.equal(remote!.published, true);
    assert.equal(remote!.variants[1].inventory_levels[0].stock, 0);
    await assert.rejects(() => syncStoreProduct(item.id, true, "stale", "100"), e => e instanceof StoreApiError && e.status === 409);
    locked = false;
    await assert.rejects(() => syncStoreProduct(item.id, true, item.updatedAt, "100"), e => e instanceof StoreApiError && e.status === 409);
    locked = true;
    // Simulate a remote product created without a local acknowledgment.
    link = null; remote = null; lostResponse = true;
    await assert.rejects(() => syncStoreProduct(item.id, true, item.updatedAt), /no respondió/);
    const countAfterTimeout = creations;
    lostResponse = false;
    await assert.rejects(() => syncStoreProduct(item.id, true, item.updatedAt), e => e instanceof StoreApiError && e.status === 409);
    assert.equal(link!.product_id, "100");
    await syncStoreProduct(item.id, true, item.updatedAt, "100");
    assert.equal(creations, countAfterTimeout);
    link = null;
    remote!.handle = { es: "campera-importada-antes" };
    await assert.rejects(() => syncStoreProduct(item.id, true, item.updatedAt), e => e instanceof StoreApiError && e.status === 409);
    assert.equal(link!.product_id, "100");
    assert.equal(creations, countAfterTimeout);
    const originalDescription = item.tienda!.descripcion;
    try {
      item.tienda!.descripcion = "";
      await syncStoreProduct(item.id, true, item.updatedAt, "100");
      assert.ok(remote!.description.es.includes(item.nombre));
      assert.ok(remote!.description.es.includes("Cómo saber tu talle"));
      assert.ok(!remote!.description.es.includes("NOTA PRIVADA"));
    } finally { item.tienda!.descripcion = originalDescription; }
    const originalCategory = { categoria: item.tienda!.categoria, categoriaId: item.tienda!.categoriaId };
    try {
      item.tienda!.categoria = ""; item.tienda!.categoriaId = null;
      await syncStoreProduct(item.id, true, item.updatedAt, "100");
      assert.deepEqual(remote!.categories, [12]);
    } finally { Object.assign(item.tienda!, originalCategory); }
    unavailable = true;
    await assert.rejects(() => storeRequest("/products"), e => e instanceof StoreApiError && e.status === 429 && !e.message.includes("private-token"));
  } finally { process.env = before; }
});
