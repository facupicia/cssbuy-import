import test from "node:test";
import assert from "node:assert/strict";
import { inferCategoryName, withStoreCategory } from "../src/lib/store-category";
import { newStoreProfile } from "../src/lib/store-defaults";

const categories = [{ id: 1, name: "Remeras" }, { id: 2, name: "Buzos" }, { id: 3, name: "Camperas" }];

test("detecta singular, plural, mayúsculas y acentos sin coincidencias parciales", () => {
  for (const [name, expected] of [
    ["Remera Bape negra", "Remeras"], ["REMERAS SUPREME", "Remeras"],
    ["Buzo Corteiz", "Buzos"], ["Hoodie gris", "Buzos"],
    ["Campera puffer", "Camperas"], ["PANTALÓN cargo", "Pantalones"],
    ["Pantalones negros", "Pantalones"], ["Short deportivo", "Shorts"],
    ["Gorra azul", "Gorras"], ["Zapatillas blancas", "Zapatillas"],
    ["Remerazo", null], ["Buzo y pantalón", null], ["Producto nuevo", null],
  ]) assert.equal(inferCategoryName(name!), expected, name!);
});

test("vincula el nombre al ID real sin modificar la ficha original", () => {
  const item = { nombre: "Remera Bape", tienda: newStoreProfile() };
  const inferred = withStoreCategory(item, categories);
  assert.equal(inferred.tienda.categoria, "Remeras");
  assert.equal(inferred.tienda.categoriaId, 1);
  assert.equal(inferred.tienda.descuentoPct, 10);
  assert.equal(item.tienda.categoria, "");
  assert.equal(withStoreCategory({ nombre: "Campera negra", tienda: null as ReturnType<typeof newStoreProfile> | null }, categories).tienda?.categoriaId, 3);
});

test("respeta categoría manual y resuelve nombres escritos en singular", () => {
  const manual = { nombre: "Remera Bape", tienda: { ...newStoreProfile(), categoria: "Ofertas", categoriaId: 9 } };
  assert.equal(withStoreCategory(manual, categories), manual);
  const byName = { ...manual, tienda: { ...manual.tienda, categoria: "Buzo", categoriaId: null } };
  assert.equal(withStoreCategory(byName, categories).tienda.categoriaId, 2);
  const unknown = { ...manual, tienda: { ...manual.tienda, categoria: "Edición limitada", categoriaId: null } };
  assert.equal(withStoreCategory(unknown, categories).tienda.categoriaId, null);
});

test("no inventa categorías ni decide ante coincidencias ambiguas", () => {
  const pants = withStoreCategory({ nombre: "Pantalón cargo", tienda: newStoreProfile() }, categories);
  assert.equal(pants.tienda.categoria, "Pantalones");
  assert.equal(pants.tienda.categoriaId, null);
  const ambiguous = withStoreCategory({ nombre: "Remera negra", tienda: newStoreProfile() }, [{ id: 4, name: "Remeras hombre" }, { id: 5, name: "Remeras mujer" }]);
  assert.equal(ambiguous.tienda.categoriaId, null);
  const custom = withStoreCategory({ nombre: "Riñoneras PLUG", tienda: newStoreProfile() }, [{ id: 6, name: "Riñoneras" }]);
  assert.equal(custom.tienda.categoriaId, 6);
});
