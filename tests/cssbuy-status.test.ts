import test from "node:test";
import assert from "node:assert/strict";
import { cssbuyOrderGroup, cssbuyStateLabel, isValidCssbuyOrder, normalizeCssbuyOrders } from "../src/lib/cssbuy-status";
import { rawItemsToRows } from "../src/lib/cssbuy-sync";
import { rowToCssbuyOrder } from "../src/lib/db";

test("códigos reales: excluye inválidos 6, conserva depósito 4/7 y enviados 5", () => {
  for (const state of [0, -1, 6, 8, 9, 10]) assert.equal(isValidCssbuyOrder({ state }), false);
  for (const state of [1, 2, 3, 4, 5, 7]) assert.equal(isValidCssbuyOrder({ state }), true);
  assert.equal(cssbuyStateLabel({ state: 5 }), "Enviado");
  assert.equal(cssbuyStateLabel({ state: 4 }), "En almacén");
  assert.equal(cssbuyOrderGroup("Enviado"), "shipped");
  assert.equal(cssbuyOrderGroup("Shipped"), "shipped");
  assert.equal(cssbuyOrderGroup("In Warehouse"), "warehouse");
  assert.equal(cssbuyOrderGroup("Shipped to warehouse"), "process");
  assert.equal(cssbuyOrderGroup("3"), "process");
});

test("cancelados y reembolsados quedan fuera aunque tengan estado válido", () => {
  for (const extra of [{ deleted: true }, { refundStatus: 1 }, { cancel_status: 2 }, { is_del: "1" }]) assert.equal(isValidCssbuyOrder({ state: 5, ...extra }), false);
  for (const text of ["Cancelado", "Reembolso", "Inválido", "Unpaid", "No pagado", "已取消"]) assert.equal(isValidCssbuyOrder({ estado: text }), false);
});

test("importación, lectura de DB y caché del navegador comparten criterio", () => {
  const raw = [4, 5, 6, 7].map(state => ({ id: String(state), state, orderGoods: { name: "Remera", num: 1 } }));
  const rows = rawItemsToRows(raw);
  assert.deepEqual(rows.map(r => r.order_no), ["4", "5", "7"]);
  const orders = rows.map(rowToCssbuyOrder);
  assert.deepEqual(orders.map(o => o.estado), ["En almacén", "Enviado", "En almacén"]);
  const stale = [...orders, { ...orders[0], oid: "invalid", estado: "6" }];
  assert.equal(normalizeCssbuyOrders(stale).length, 3);
});
