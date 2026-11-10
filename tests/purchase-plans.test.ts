import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { mockAccount } from "./helpers/account";
import { GET, POST, PATCH } from "../src/app/api/compras/route";
import { cssbuyProductUrl, newPlan, newPlanLine, parsePlan, planMissing, planQuote } from "../src/lib/purchase-plans";
import { adminReturnPath } from "../src/lib/admin-navigation";

const url = "https://www.cssbuy.com/shop/goodsDetail?id=1029556292572&type=1688";
function fixture() {
  return { ...newPlan(1400, 7, 5.3), fleteUSD: 30, impuestosUSD: 12, extraUSD: 2,
    lineas: [{ ...newPlanLine(url), nombre: "Remera", variante: "L negro", cantidad: 2, precioCNY: 70, envioChinaCNY: 14, pesoG: 300, ventaARS: 60000 },
      { ...newPlanLine(url), nombre: "Buzo", variante: "M blanco", cantidad: 1, precioCNY: 140, envioChinaCNY: 7, pesoG: 600, ventaARS: 80000 }] };
}
test("solo se aceptan fichas CSSBuy; el ID y plataforma se conservan sin rastreadores", () => {
  assert.equal(cssbuyProductUrl(url + "&utm_source=test#hello"), url);
  assert.equal(cssbuyProductUrl(url.replace("www.", "")), url);
  for (const bad of ["javascript:alert(1)", "https://cssbuy.com.evil.test/shop/goodsDetail?id=1&type=1688", "http://www.cssbuy.com/shop/goodsDetail?id=1&type=1688", "https://secret@www.cssbuy.com/shop/goodsDetail?id=1&type=1688", url.replace("goodsDetail", "cate/order"), url.replace("1029556292572", "mal"), url.replace("&type=1688", ""), url.replace(".com/", ".com:8080/")]) assert.throws(() => cssbuyProductUrl(bad));
  assert.equal(adminReturnPath("/calculadora/pedidos"), "/calculadora/pedidos");
});
test("el borrador admite datos pendientes y listo exige completar todos los supuestos", () => {
  const draft = newPlan(1400, 7, 5.3);
  assert.ok(planMissing(parsePlan(draft)).includes("productos"));
  const line = newPlanLine(url); draft.lineas.push(line);
  assert.ok(planMissing(parsePlan(draft)).includes("precios"));
  assert.throws(() => parsePlan({ ...draft, estado: "listo" }));
  assert.equal(parsePlan({ ...fixture(), estado: "listo" }).lineas.length, 2);
  for (const patch of [{ usdARS: 0 }, { cnyUSD: -1 }, { extraUSD: Infinity }, { fleteUSD: -3 }, { comisionPct: 101 }, { estado: ["borrador"] }, { lineas: [{ ...line, cantidad: 1.5 }] }, { lineas: [{ ...line, cantidad: 0 }] }, { lineas: [{ ...line, precioCNY: -1 }] }, { lineas: [{ ...line, pesoG: 0 }] }, { lineas: [line, line] }, { lineas: Array(101).fill(line) }]) assert.throws(() => parsePlan({ ...fixture(), ...patch }));
});
test("envío China es total por fila y flete/impuestos/comisión se prorratean por peso sin perder costos", () => {
  const plan = parsePlan(fixture());
  const quote = planQuote(plan);
  const result = quote.resultados;
  assert.equal(result.productosUSDTotal, 43); // (70*2 + 14 + 140 + 7) / 7
  assert.equal(result.pesoTotalG, 1200);
  assert.equal(result.costoEnvioTotalUSD, 32);
  assert.equal(result.depositFeeUSD, 75 * .053);
  assert.equal(result.impuestosUSD, 12);
  assert.equal(result.costoTotalUSD, 75 + 75 * .053 + 12);
  const summed = result.productosCalc.reduce((sum, item) => sum + item.costoUnitUSD * item.cantidad, 0);
  assert.ok(Math.abs(summed - result.costoTotalUSD) < 1e-9);
  assert.equal(result.productosCalc[0].envioProrrateadoUSD, 16);
  assert.equal(result.productosCalc[1].envioProrrateadoUSD, 16);
  assert.equal(result.ingresoTotalARS, 200000);
  assert.equal(quote.productos[0].nombre, "Remera · L negro");
  assert.equal(quote.productos[0].oid, undefined); // A plan is never an existing CSSBuy purchase.
  const bigger = { ...plan, lineas: plan.lineas.map((line, index) => index ? line : { ...line, cantidad: 4 }) };
  assert.equal(planQuote(bigger).resultados.productosUSDTotal, 63); // no repeated domestic shipping
});
test("API privada conserva planes, valida antes de escribir y bloquea versiones antiguas", async t => {
  const cookie = mockAccount(t);
  const id = "12345678-1234-1234-1234-123456789abc", now = new Date();
  const data = parsePlan(fixture());
  let stored = { id, data, version: 1, created_at: now, updated_at: now };
  let calls = 0;
  t.mock.method(Pool.prototype, "query", async (sql: string, values: unknown[] = []) => {
    calls++;
    if (sql.startsWith("SELECT")) return { rows: [stored] };
    if (sql.startsWith("INSERT")) { assert.deepEqual(JSON.parse(String(values[1])), data); return { rows: [stored] }; }
    if (sql.startsWith("UPDATE")) {
      assert.ok(sql.includes("WHERE id=$2 AND version=$3"));
      if (values[2] !== stored.version) return { rows: [] };
      stored = { ...stored, data: JSON.parse(String(values[0])), version: stored.version + 1 };
      return { rows: [stored] };
    }
    return { rows: [] };
  });
  const req = (method: string, body?: unknown, auth = true, origin = "https://panel.example") => new Request("https://panel.example/api/compras", { method, headers: { origin, cookie: auth ? cookie : "", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await GET(req("GET", undefined, false))).status, 401);
  assert.equal((await POST(req("POST", data, true, "https://evil.test"))).status, 403);
  assert.equal((await POST(req("POST", { ...data, usdARS: 0 }))).status, 400);
  assert.equal(calls, 0);
  const created = await POST(req("POST", data)); assert.equal(created.status, 201);
  assert.ok(created.headers.get("Cache-Control")?.includes("no-store"));
  assert.deepEqual((await (await GET(req("GET"))).json()).pedidos[0].lineas, data.lineas);
  assert.equal((await PATCH(req("PATCH", { ...data, id, version: 1, notas: "Revisar medidas" }))).status, 200);
  assert.equal((await PATCH(req("PATCH", { ...data, id, version: 1 }))).status, 409);
  assert.equal(stored.data.notas, "Revisar medidas");
  assert.equal((await PATCH(req("PATCH", { ...data, id, version: 2, estado: "archivado" }))).status, 200);
  assert.equal(stored.data.estado, "archivado");
});
test("lectura de ficha solo acepta precios unitarios CNY inequívocos; nunca rangos ni USD", async () => {
  const source = await readFile("extensions/cssbuy-connector/product-collector.js", "utf8");
  const read = (products: unknown[]) => {
    const context = vm.createContext({ document: { querySelectorAll: () => products.map(value => ({ textContent: JSON.stringify(value) })) }, location: { href: url } });
    vm.runInContext(source, context); return context.collectCssbuyProduct();
  };
  const product = { "@type": "Product", name: "Remera negra", offers: { priceCurrency: "CNY", price: "79.5" } };
  assert.equal(read([product]).precioCNY, 79.5);
  assert.equal(read([{ "@graph": [product] }]).nombre, "Remera negra");
  assert.equal(read([{ ...product, offers: { priceCurrency: "USD", price: "79.5" } }]).precioCNY, null);
  assert.equal(read([{ ...product, offers: { "@type": "AggregateOffer", priceCurrency: "CNY", lowPrice: "50", highPrice: "100" } }]).precioCNY, null);
  assert.equal(read([{ ...product, offers: [{ priceCurrency: "CNY", price: "50" }, { priceCurrency: "CNY", price: "100" }] }]).precioCNY, null);
  assert.throws(() => read([product, { ...product, name: "Otro" }]));
  assert.throws(() => read([]));
});
