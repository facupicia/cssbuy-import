import { test } from "node:test";
import assert from "node:assert/strict";
import { marketplaceProduct, marketplaceListingUrl, parseMarketplaceInput } from "../src/lib/marketplace";
import type { InventoryItem } from "../src/lib/types";

const item: InventoryItem = { id: "00000000-0000-4000-8000-000000000001", nombre: "Remera Marca", variante: "Color: Negro; Talle: L", precioVentaARS: 51000, cantidadInicial: 2, cantidadVendida: 0,
  costoUnitARS: 9000, costoUnitUSD: 5, estado: "en_deposito", origen: "manual", notas: "PRIVADO", ubicacion: "DIRECCIÓN PRIVADA", link: "https://proveedor.example", tienda: { fotos: ["data:image/png;base64,aGVsbG8="], descripcion: "Una ficha larga que no debe copiarse", categoria: "Remeras", categoriaId: null, pesoKg: 0, descuentoPct: 10, redondearA: 1000 },
  talles: [{ talle: "L", cantidadInicial: 1, cantidadVendida: 1 }, { talle: "XL", cantidadInicial: 2, cantidadVendida: 0 }], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
test("publicación por producto, solo talles disponibles y precio propio sin fórmulas de Tiendanube", () => {
  const p = marketplaceProduct(item, "Marca");
  assert.equal(p.stock, 2); assert.deepEqual(p.sizes, ["XL"]);
  assert.equal(p.generated.title, "Remera Marca negro talle XL"); assert.equal(p.generated.price, 51000);
  assert.equal(p.generated.description, "Talle XL.\nRetiro en Rosario. Consultá por envío.\nMás fotos e info en Instagram: @theplug.ros");
  assert.equal(p.generated.condition, ""); assert.deepEqual(p.issues, []);
  const exported = JSON.stringify(p);
  for (const privateValue of ["PRIVADO", "DIRECCIÓN PRIVADA", "proveedor.example", "costoUnit", "descuentoPct", "Una ficha larga"]) assert.ok(!exported.includes(privateValue));
});
test("no inventa talle, composición ni condición; detecta agotados, tránsito y fotos faltantes", () => {
  const p = marketplaceProduct({ ...item, talles: null, variante: null, imagen: null, tienda: null, cantidadInicial: 0, estado: "en_transito" });
  assert.deepEqual(p.sizes, []); assert.equal(p.generated.condition, "");
  assert.equal(p.issues.length, 3); assert.ok(!p.generated.title.includes("talle"));
});
test("validación rechaza precios inválidos, textos vacíos, objetos y URLs ajenas a avisos", () => {
  const input = marketplaceProduct(item).generated;
  assert.equal(parseMarketplaceInput(input).itemId, item.id);
  for (const price of [0, -1, Infinity, NaN, 1.234, "51000"]) assert.throws(() => parseMarketplaceInput({ ...input, price }));
  for (const field of [{ title: " " }, { title: "x".repeat(101) }, { condition: "Original" }, { category: "Inventada" }, { sourceVersion: "yesterday" }, { location: {} }]) assert.throws(() => parseMarketplaceInput({ ...input, ...field }));
  assert.equal(marketplaceListingUrl("https://m.facebook.com/marketplace/item/123456789?tracking=foo"), "https://www.facebook.com/marketplace/item/123456789/");
  for (const u of ["https://facebook.com.evil.test/marketplace/item/12", "javascript:alert(1)", "https://user@facebook.com/marketplace/item/12", "https://facebook.com:444/marketplace/item/12", "https://facebook.com/ads/12", "http://facebook.com/marketplace/item/12"]) assert.throws(() => marketplaceListingUrl(u));
});
test("títulos largos conservan el talle y no duplican marca ni color ya presentes", () => {
  assert.equal(marketplaceProduct({ ...item, nombre: "Remera Marca negra", variante: "Color: Negra", talles: null }, "Marca").generated.title, "Remera Marca negra");
  const p = marketplaceProduct({ ...item, nombre: "Remera ".repeat(25) }); assert.ok(p.generated.title.length <= 100); assert.ok(p.generated.title.endsWith("talle XL"));
});
