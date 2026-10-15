import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { Pool } from "pg";
import { parseBridgePayload, importBridge } from "../src/lib/cssbuy-bridge";
import { GET, POST } from "../src/app/api/cssbuy/bridge/route";

const order = { id: "123", state: 4, totalPrice: 48, orderGoods: { name: "Remera", num: 1, weightWithBox: 297 } };
const record = { id: "r1", money: "-48.00", action: "Buy Item", remark: "Order id:123", addtime: 1700000000 };

test("importación valida y conserva IDs, excluye cancelados y no recibe credenciales", () => {
  const parsed = parseBridgePayload({ orders: [order, order, { ...order, id: "cancel", state: 8 }], records: [record] });
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].order_no, "123");
  assert.equal(parsed.warning, null);
  assert.equal(parsed.records?.[0].id, "r1");
  assert.equal(parseBridgePayload({ orders: [], records: null }).records, null);
  const withoutId = { money: -5, action: "Domestic Shipping", remark: "Order id:123", addtime: 1700000000 };
  assert.equal(parseBridgePayload({ orders: [], records: [withoutId] }).records?.[0].id,
    parseBridgePayload({ orders: [], records: [withoutId] }).records?.[0].id);
  for (const body of [{ orders: [null] }, { orders: [{}] }, { orders: [], records: [{}] }, { orders: [], records: [{ ...record, money: "mal" }] }]) assert.throws(() => parseBridgePayload(body));
});

test("pedidos, movimientos y estado se confirman juntos; fallo revierte la transacción", async t => {
  const calls: string[] = []; let fail = false;
  const query = async (sql: string) => {
    calls.push(sql);
    if (sql.startsWith("INSERT INTO cssbuy_records") && fail) throw new Error("test failure");
    if (sql.startsWith("INSERT INTO cssbuy_orders")) return { rows: [{ was_inserted: true }] };
    return { rows: [] };
  };
  t.mock.method(Pool.prototype, "query", async (sql: string) => {
    assert.ok(!sql.startsWith("INSERT"), "las escrituras deben usar el cliente de la transacción");
    return { rows: [] };
  });
  t.mock.method(Pool.prototype, "connect", async () => ({ query, release() {} }));
  const payload = parseBridgePayload({ orders: [order], records: [record] });
  const result = await importBridge(payload);
  assert.equal(result.inserted, 1);
  assert.ok(calls.indexOf("BEGIN") < calls.findIndex(s => s.startsWith("INSERT INTO cssbuy_orders")));
  assert.ok(calls.includes("COMMIT"));
  calls.length = 0; fail = true;
  await assert.rejects(() => importBridge(payload), /test failure/);
  assert.ok(calls.includes("ROLLBACK")); assert.ok(!calls.includes("COMMIT"));
});

test("el ingreso exige sesión administrativa y mismo origen", async () => {
  assert.equal((await GET(new Request("https://panel.example/api/cssbuy/bridge"))).status, 401);
  assert.equal((await POST(new Request("https://panel.example/api/cssbuy/bridge", { method: "POST", headers: { Origin: "https://otro.example" }, body: "{}" }))).status, 403);
});

test("conector: pagina por el endpoint real, no devuelve tokens y rechaza pedidos incompletos", async () => {
  const source = await readFile("extensions/cssbuy-connector/collector.js", "utf8");
  let failSecond = false; let failRecords = false; const paths: string[] = [];
  const context = vm.createContext({ location: { origin: "https://www.cssbuy.com", href: "https://www.cssbuy.com/shop/cate/order" },
    localStorage: { getItem: (key: string) => key === "css-token" ? "test-secret-token" : "device" }, AbortSignal, FormData,
    setTimeout: (fn: () => void) => fn(),
    fetch: async (path: string, init: RequestInit) => {
      paths.push(path);
      assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-secret-token");
      if (path.includes("/record")) {
        if (failRecords) throw new Error("record failure");
        assert.ok(init.body instanceof FormData);
        assert.equal((init.body as FormData).get("lang"), "en");
        assert.equal(init.method, "POST"); return { ok: true, json: async () => ({ code: 0, data: [record] }) };
      }
      if (path.includes("page=2") && failSecond) throw new Error("page failure");
      return { ok: true, json: async () => ({ code: 0, data: { total: 101, records: path.includes("page=1&")
        ? Array.from({ length: 100 }, (_, i) => ({ ...order, id: String(i) })) : [{ ...order, id: "100" }] } }) };
    } });
  vm.runInContext(source, context);
  const result = await vm.runInContext("collectCssbuy()", context);
  assert.equal(result.orders.length, 101); assert.equal(result.records.length, 1);
  assert.ok(!JSON.stringify(result).includes("test-secret-token"));
  assert.ok(paths.every(p => p.startsWith("/api/v3/user/order?") || p === "/api/v2/user/record"));
  failRecords = true;
  const partial = await vm.runInContext("collectCssbuy()", context);
  assert.equal(partial.records, null); assert.ok(partial.recordsError);
  failSecond = true;
  await assert.rejects(() => vm.runInContext("collectCssbuy()", context), /page failure/);
});
