import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_INVENTORY_FILTERS, filtrarInventario, paginarInventario, type InventoryFilters } from "../src/lib/inventory-list";
import type { InventoryItem } from "../src/lib/types";

const base: InventoryItem = { id: "1", nombre: "Remera algodón", marcaId: "bape", variante: "Color:Negro", sku: "R1", estado: "en_deposito", origen: "manual", cantidadInicial: 5, cantidadVendida: 2, costoUnitARS: 100, costoUnitUSD: 1, precioVentaARS: 150, createdAt: "", updatedAt: "", talles: [{ talle: "M", cantidadInicial: 2, cantidadVendida: 2, sku: "R-M" }, { talle: "L", cantidadInicial: 3, cantidadVendida: 0, sku: "R-L" }] };
const items = [base, { ...base, id: "2", marcaId: "supreme", variante: "Color:Blanco;Talle:M", talles: null, origen: "cssbuy" as const, precioVentaARS: 250 }, { ...base, id: "3", marcaId: null, nombre: "Campera", estado: "en_transito" as const }];
const filter = (patch: Partial<InventoryFilters>, query = "") => filtrarInventario(items, { ...EMPTY_INVENTORY_FILTERS, ...patch }, query).map(i => i.id);

test("opciones de un grupo se suman; grupos diferentes se cruzan", () => {
  assert.deepEqual(filter({ marcas: ["bape", "supreme"] }), ["1", "2"]);
  assert.deepEqual(filter({ marcas: ["bape", "supreme"], colores: ["Blanco"], origenes: ["cssbuy"], talles: ["M", "L"], precioMin: "200", precioMax: "300" }), ["2"]);
  assert.deepEqual(filter({ marcas: ["sin_marca"], estados: ["en_transito"], categorias: ["Camperas"] }), ["3"]);
  assert.deepEqual(filter({ precioMin: "300", precioMax: "100" }), []);
  assert.deepEqual(filter({}, "algodon"), ["1", "2"]);
  assert.deepEqual(filter({}, "r-l"), ["1", "3"]);
});

test("stock y talle se evalúan juntos para no ofrecer un talle agotado", () => {
  assert.deepEqual(filter({ marcas: ["bape"], talles: ["M"], stock: ["disponible"] }), []);
  assert.deepEqual(filter({ marcas: ["bape"], talles: ["M"], stock: ["agotado"] }), ["1"]);
  assert.deepEqual(filter({ marcas: ["bape"], talles: ["M", "L"], stock: ["bajo"] }), ["1"]);
  assert.deepEqual(filter({ talles: ["L"], stock: ["disponible", "agotado"] }), ["1", "3"]);
});

test("paginación sin omisiones, límite después de borrar y resultados vacíos", () => {
  const rows = Array.from({ length: 53 }, (_, i) => i);
  assert.deepEqual([1, 2, 3].flatMap(p => paginarInventario(rows, p, 20).items), rows);
  assert.deepEqual(paginarInventario(rows, 3, 20), { items: rows.slice(40), page: 3, pages: 3, from: 41, to: 53, total: 53 });
  assert.equal(paginarInventario(rows.slice(0, 20), 3, 20).page, 1);
  assert.equal(paginarInventario([], 99, 20).from, 0);
  assert.deepEqual(paginarInventario([], 99, 20).items, []);
  assert.equal(paginarInventario(rows, 2, 50).items.length, 3);
});
