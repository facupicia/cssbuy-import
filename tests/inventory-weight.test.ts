import assert from "node:assert/strict";
import test from "node:test";
import { fillInventoryWeights, gramsToKg } from "../src/lib/inventory-weight";
import { EMPTY_STORE_PROFILE, storeVariants, storeReadiness } from "../src/lib/store-product";
import type { InventoryItem } from "../src/lib/types";

const item: InventoryItem = {
  id: "test", nombre: "Remera", origen: "cssbuy", origenRef: "123",
  cantidadInicial: 5, cantidadVendida: 2, costoUnitUSD: 10,
  costoUnitARS: 15000, precioVentaARS: 30000, estado: "en_deposito",
  createdAt: "2026-10-15T12:00:00Z", updatedAt: "2026-10-15T12:00:00Z",
  tienda: { ...EMPTY_STORE_PROFILE, descripcion: "Algodón", categoria: "Remeras", fotos: ["https://example.com/remera.jpg"] },
};

test("peso unitario de la cotización más reciente llega a la ficha y las variantes", () => {
  const [result] = fillInventoryWeights([item], [
    { productos: [{ oid: "123", pesoG: 313 }] },
    { productos: [{ oid: "123", pesoG: 400 }] },
  ], [{ oid: "123", peso_g: 2000, cantidad: 5 }]);
  assert.equal(result.tienda?.pesoKg, 0.313);
  assert.equal(storeVariants(result)[0].weight, 0.313);
  assert.equal(storeReadiness(result, "Bape").ready, true);
  assert.equal(result.updatedAt, item.updatedAt);
  assert.equal(item.tienda?.pesoKg, 0);
});

test("respeta peso manual y los demás datos públicos", () => {
  const manual = { ...item, tienda: { ...item.tienda!, pesoKg: 0.5 } };
  assert.equal(fillInventoryWeights([manual], [{ productos: [{ oid: "123", pesoG: 313 }] }], [])[0], manual);
  const [result] = fillInventoryWeights([item], [{ productos: [{ oid: "123", pesoG: 313 }] }], []);
  assert.deepEqual(result.tienda, { ...item.tienda, pesoKg: 0.313 });
});

test("CSSBuy usa peso por unidad sin dividir por el stock restante", () => {
  const [result] = fillInventoryWeights([item], [], [{ oid: "123", peso_g: 1565, cantidad: 5 }]);
  assert.equal(result.tienda?.pesoKg, 0.313);
  assert.equal(fillInventoryWeights([item], [], [])[0], item);
});

test("ignora pesos inválidos y cotizaciones sin peso, sin vincular productos por nombre", () => {
  for (const value of [0, -1, NaN, Infinity, undefined, 1_000_001]) assert.equal(gramsToKg(value), 0);
  const [result] = fillInventoryWeights([item], [
    { productos: [{ oid: "123", pesoG: 0 }, { oid: "otro", pesoG: 900 }] },
    { productos: [{ oid: "123", pesoG: 336 }] },
  ], []);
  assert.equal(result.tienda?.pesoKg, 0.336);
});
