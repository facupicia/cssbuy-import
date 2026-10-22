import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { EMPTY_SUPPLIER, filterSuppliers, parseSupplier, supplierUrl, type Supplier } from "../src/lib/suppliers";
import { mockAccount } from "./helpers/account";
import { GET, POST, PATCH, DELETE } from "../src/app/api/proveedores/route";
import { adminReturnPath } from "../src/lib/admin-navigation";

test("agenda valida enlaces, límites y tipo; permite proveedores sin sitio web", () => {
  assert.equal(parseSupplier({ ...EMPTY_SUPPLIER, nombre: "  Fábrica del sur ", notas: " Una nota\ncon dos líneas " }).notas, "Una nota\ncon dos líneas");
  assert.equal(supplierUrl("https://EXAMPLE.com/shop#contact"), "https://example.com/shop");
  for (const url of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.com", "/local", "example.com", "file:///C:/example"]) assert.throws(() => supplierUrl(url));
  for (const input of [{ ...EMPTY_SUPPLIER }, { ...EMPTY_SUPPLIER, nombre: "a", tipo: "otro" }, { ...EMPTY_SUPPLIER, nombre: "a", notas: "a".repeat(4001) }, { ...EMPTY_SUPPLIER, nombre: "a", favorito: "true" }]) assert.throws(() => parseSupplier(input));
  assert.equal(adminReturnPath("/calculadora/proveedores?nuevo=1&nombre=ABC"), "/calculadora/proveedores?nuevo=1&nombre=ABC");
});
test("búsqueda incluye notas y contactos, combina filtros y prioriza favoritos", () => {
  const base: Supplier = { ...EMPTY_SUPPLIER, id: "1", nombre: "Textiles Álvarez", categoria: "Remeras", contacto: "WeChat: fabrica123", tipo: "fabrica", notas: "Pedir un talle más", favorito: true, version: 1, createdAt: "", updatedAt: "" };
  const items = [base, { ...base, id: "2", nombre: "A tienda", favorito: false, tipo: "vendedor" as const }];
  assert.equal(filterSuppliers(items, "alvarez", "fabrica", "Remeras", true).length, 1);
  assert.equal(filterSuppliers(items, "talle mas", "", "", false).length, 2);
  assert.equal(filterSuppliers(items, "fabrica123", "vendedor", "", true).length, 0);
  assert.equal(filterSuppliers(items, "", "", "", false)[0].id, "1");
});
test("agenda privada persiste notas; rechaza cambios concurrentes y enlaces de tienda duplicados", async t => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "administracion-de-prueba-segura";
  const id = "12345678-1234-1234-1234-123456789abc";
  const now = new Date();
  const row = { id, nombre: "Fábrica", tipo: "fabrica", categoria: "Remeras", tienda_url: "https://example.com/shop", referencia_url: "", contacto: "WeChat: fabrica123", notas: "Talles amplios", favorito: true, version: 1, created_at: now, updated_at: now };
  let queries = 0, stale = false, duplicate = false;
  t.mock.method(Pool.prototype, "query", async (sql: string, values: unknown[] = []) => {
    queries++;
    if (sql.startsWith("SELECT")) return { rows: [row] };
    if (sql.startsWith("INSERT")) {
      if (duplicate) throw Object.assign(new Error("unique"), { code: "23505" });
      assert.equal(values[6], "Talles amplios"); return { rows: [row] };
    }
    if (sql.startsWith("UPDATE")) { assert.ok(sql.includes("WHERE id=$9 AND version=$10")); assert.equal(values[9], 1); return { rows: stale ? [] : [{ ...row, version: 2 }] }; }
    if (sql.startsWith("DELETE")) { assert.ok(sql.includes("version=$2")); return { rows: stale ? [] : [{ id }], rowCount: stale ? 0 : 1 }; }
    return { rows: [] };
  });
  const cookie = mockAccount(t);
  const body = { ...EMPTY_SUPPLIER, nombre: "Fábrica", tipo: "fabrica", notas: "Talles amplios" };
  const request = (method = "GET", payload?: unknown, authenticated = true, origin = "https://panel.example") => new Request("https://panel.example/api/proveedores", { method, headers: { origin, cookie: authenticated ? cookie : "", "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  try {
    assert.equal((await GET(request("GET", undefined, false))).status, 401);
    assert.equal((await POST(request("POST", body, true, "https://evil.example"))).status, 403);
    assert.equal((await POST(request("POST", { ...body, tiendaUrl: "javascript:alert(1)" }))).status, 400);
    assert.equal(queries, 0);
    const saved = await POST(request("POST", body)); assert.equal(saved.status, 201); assert.equal((await saved.json()).proveedor.notas, "Talles amplios");
    assert.equal((await (await GET(request())).json()).proveedores[0].contacto, "WeChat: fabrica123");
    duplicate = true; assert.equal((await POST(request("POST", body))).status, 409); duplicate = false;
    assert.equal((await PATCH(request("PATCH", { ...body, id, version: 1 }))).status, 200);
    stale = true;
    assert.equal((await PATCH(request("PATCH", { ...body, id, version: 1 }))).status, 409);
    assert.equal((await DELETE(request("DELETE", { id, version: 1 }))).status, 409);
    stale = false; assert.equal((await DELETE(request("DELETE", { id, version: 1 }))).status, 200);
  } finally { if (previous === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previous; }
});
