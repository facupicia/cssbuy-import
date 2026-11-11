import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { mockAccount } from "./helpers/account";
import { GET } from "../src/app/api/compras/guardados/route";
import { sourceLinks, filterSavedLinks, appendSavedLinks } from "../src/lib/purchase-plan-sources";
import { newPlan, newPlanLine, parsePlan, planProductUrl, canReadCssbuyProduct } from "../src/lib/purchase-plans";

const url = "https://www.cssbuy.com/shop/goodsDetail?id=1029556292572&type=1688";
const original = "https://detail.1688.com/offer/1029556292572.html";
test("los productos guardados aceptan enlaces de origen sin ampliar el conector CSSBuy", () => {
  assert.equal(planProductUrl(original), original);
  assert.equal(planProductUrl(url + "&utm_source=otro"), url);
  assert.equal(canReadCssbuyProduct(original), false); assert.equal(canReadCssbuyProduct(url), true);
  const plan = { ...newPlan(1400, 7, 5.3), lineas: [newPlanLine(original)] };
  assert.equal(parsePlan(plan).lineas[0].url, original);
  for (const link of ["javascript:alert(1)", "file:///private", "https://user:pass@example.com/product", "", "data:text/html,test"]) assert.throws(() => planProductUrl(link));
});
test("proveedores separa catálogo de referencia; inventario incluye talles sin inferir precio ni stock", () => {
  const suppliers = sourceLinks("proveedores", [{ id: "p", nombre: "Fábrica guardada", categoria: "Remeras", tiendaUrl: "https://example.com/catalogo", referenciaUrl: original, contacto: "dato privado", notas: "nota privada" }]);
  assert.equal(suppliers.length, 2); assert.equal(suppliers[0].nombre, "");
  assert.equal(suppliers[0].kind, "producto"); assert.equal(suppliers[1].kind, "catalogo");
  const inventory = sourceLinks("inventario", [{ id: "i", nombre: "Remera", variante: "Negro", link: original, talles: [{ talle: "L", cantidadInicial: 1, cantidadVendida: 1 }, { talle: "XL", cantidadInicial: 2, cantidadVendida: 0 }], costoUnitARS: 20000 }]);
  assert.deepEqual(inventory.map(item => item.variante), ["Negro · L", "Negro · XL"]);
  assert.equal(sourceLinks("inventario", [{ id: "i", nombre: "Sin link", link: "javascript:alert(1)" }]).length, 0);
  assert.equal(filterSavedLinks(suppliers, "proveedores", "fabrica").length, 2);
  assert.ok(!JSON.stringify(suppliers).includes("dato privado"));
});
test("permite reutilizar CSSBuy, cotizaciones y planes sin copiar costos ni cantidades anteriores", () => {
  const cssbuy = sourceLinks("cssbuy", [{ oid: "o1", producto: "Buzo", variante: "M", url, precio_unitario_cny: 150, peso_g: 600, cantidad: 9 }]);
  const quotes = sourceLinks("cotizaciones", [{ id: "q1", nombre: "Drop anterior", productos: [{ nombre: "Remera", link: original, cantidad: 20, precioCNY: 90 }] }]);
  const plans = sourceLinks("pedidos", [{ id: "actual", nombre: "Actual", estado: "borrador", lineas: [{ nombre: "Campera", variante: "XL", url }] }, { id: "viejo", nombre: "Archivado", estado: "archivado", lineas: [{ nombre: "No usar", url }] }]);
  assert.equal(plans.length, 1); assert.equal(filterSavedLinks(plans, "pedidos", "", "actual").length, 0);
  const result = appendSavedLinks([], [...cssbuy, ...quotes, ...plans]);
  assert.equal(result.added, 3);
  assert.ok(result.lineas.every(line => line.cantidad === 1 && line.precioCNY === null && line.pesoG === null && line.ventaARS === null && line.envioChinaCNY === 0 && line.leidoEn === null));
  assert.equal(result.lineas[0].variante, "M");
});
test("omite duplicados por enlace y variante sin agregar catálogos ni exceder cien filas", () => {
  const entries = sourceLinks("inventario", [{ id: "i", nombre: "Remera", variante: "L", link: url }]);
  const existing = [{ ...newPlanLine(url), variante: "l" }];
  const duplicate = appendSavedLinks(existing, entries);
  assert.equal(duplicate.added, 0); assert.equal(duplicate.skipped, 1); assert.equal(duplicate.lineas.length, 1);
  assert.equal(appendSavedLinks([], [{ ...entries[0], kind: "catalogo" }]).added, 0);
  assert.throws(() => appendSavedLinks(Array.from({ length: 100 }, (_, i) => ({ ...newPlanLine(url), variante: String(i) })), entries), /100/);
});
test("la consulta privada no descarga sitios y conserva fuentes sanas ante fallos parciales", async t => {
  const previous = Object.fromEntries(["PGHOST", "PGUSER", "PGDATABASE"].map(key => [key, process.env[key]]));
  for (const key of Object.keys(previous)) process.env[key] = "isolated-mocked-db";
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const cookie = mockAccount(t);
  let calls = 0;
  t.mock.method(Pool.prototype, "query", async (sql: string) => {
    calls++;
    if (sql.includes("FROM suppliers")) return { rows: [{ id: "p1", nombre: "Proveedor", categoria: "Remeras", tipo: "fabrica", tienda_url: "https://example.com/catalogo", referencia_url: original, contacto: "no-enviar", notas: "nota-privada", favorito: false, version: 1, created_at: new Date(), updated_at: new Date() }] };
    if (sql.includes("FROM cssbuy_orders")) throw new Error("DB failure with private details");
    return { rows: [] };
  });
  const request = (auth = true) => new Request("https://panel.example/api/compras/guardados", { headers: { cookie: auth ? cookie : "" } });
  assert.equal((await GET(request(false))).status, 401); assert.equal(calls, 0);
  const result = await GET(request()); const data = await result.json();
  assert.equal(result.status, 200); assert.ok(result.headers.get("cache-control")?.includes("no-store"));
  assert.ok(data.links.some((link: { source: string }) => link.source === "proveedores"));
  assert.ok(data.warnings.some((warning: string) => warning.includes("cssbuy")));
  for (const secret of ["no-enviar", "nota-privada", "DB failure"]) assert.ok(!JSON.stringify(data).includes(secret));
});
