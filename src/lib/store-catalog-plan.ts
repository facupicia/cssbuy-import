import { publicDescription } from "./store-product";

export interface CatalogProduct {
  id: number; name: string; descriptionHtml: string; brand: string; categoryIds: number[];
  visibility: string; updatedAt: string; version: string; linkedItemId?: string;
  variants: { id: number; label: string; sku: string; price: number; weight: number; promotionalPrice: number | null }[];
}
export interface CatalogChanges {
  name?: { mode: "set" | "prefix" | "suffix" | "replace"; value: string; find?: string };
  price?: { mode: "percent" | "fixed"; value: number };
  categoryId?: number; brand?: string; weightKg?: number; description?: string;
  visibility?: "visible" | "hidden"; clearPromotion?: boolean;
}
export function parseCatalogChanges(raw: unknown): CatalogChanges {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Cambios inválidos");
  const r = raw as Record<string, any>; const out: CatalogChanges = {};
  if (Object.keys(r).some(k => !["name", "price", "categoryId", "brand", "weightKg", "description", "visibility", "clearPromotion"].includes(k))) throw new Error("Campo no permitido");
  if (r.name !== undefined) {
    if (!r.name || !["set", "prefix", "suffix", "replace"].includes(r.name.mode) || typeof r.name.value !== "string" || r.name.value.length > 250
      || (r.name.mode === "replace" && (typeof r.name.find !== "string" || !r.name.find || r.name.find.length > 250))) throw new Error("Cambio de nombre inválido");
    out.name = { mode: r.name.mode, value: r.name.value, ...(r.name.mode === "replace" ? { find: r.name.find } : {}) };
  }
  if (r.price !== undefined) {
    if (!r.price || !["percent", "fixed"].includes(r.price.mode) || typeof r.price.value !== "number" || !Number.isFinite(r.price.value)
      || r.price.value > (r.price.mode === "percent" ? 1000 : 1e9) || r.price.value < (r.price.mode === "percent" ? -99 : 0.01)) throw new Error("Cambio de precio inválido");
    out.price = { mode: r.price.mode, value: r.price.value };
  }
  if (r.categoryId !== undefined) {
    if (!Number.isSafeInteger(r.categoryId) || r.categoryId <= 0) throw new Error("Categoría inválida"); out.categoryId = r.categoryId;
  }
  if (r.brand !== undefined) { if (typeof r.brand !== "string" || r.brand.length > 200) throw new Error("Marca inválida"); out.brand = r.brand.trim(); }
  if (r.weightKg !== undefined) { if (typeof r.weightKg !== "number" || !Number.isFinite(r.weightKg) || r.weightKg <= 0 || r.weightKg > 1000) throw new Error("Peso inválido"); out.weightKg = r.weightKg; }
  if (r.description !== undefined) { if (typeof r.description !== "string" || r.description.length > 10000) throw new Error("Descripción inválida"); out.description = r.description; }
  if (r.visibility !== undefined) { if (!["visible", "hidden"].includes(r.visibility)) throw new Error("Visibilidad inválida"); out.visibility = r.visibility; }
  if (r.clearPromotion !== undefined) { if (r.clearPromotion !== true) throw new Error("Promoción inválida"); out.clearPromotion = true; }
  if (!Object.keys(out).length) throw new Error("Elegí al menos un campo para editar");
  return out;
}
export function catalogTarget(product: CatalogProduct, changes: CatalogChanges): CatalogProduct {
  let name = product.name;
  if (changes.name) {
    const op = changes.name;
    name = op.mode === "set" ? op.value : op.mode === "prefix" ? op.value + name : op.mode === "suffix" ? name + op.value : name.split(op.find!).join(op.value);
    name = name.trim();
    if (!name || name.length > 250) throw new Error("El nombre resultante debe tener entre 1 y 250 caracteres");
  }
  const variants = product.variants.map(v => {
    const price = changes.price ? Math.round((changes.price.mode === "fixed" ? changes.price.value : v.price * (1 + changes.price.value / 100)) * 100) / 100 : v.price;
    if (changes.price && (!Number.isFinite(price) || price <= 0 || price > 1e9)) throw new Error("El precio resultante no es válido");
    return { ...v, price, weight: changes.weightKg ?? v.weight, promotionalPrice: changes.clearPromotion ? null : v.promotionalPrice };
  });
  return { ...product, name, variants, brand: changes.brand ?? product.brand,
    categoryIds: changes.categoryId ? [changes.categoryId] : product.categoryIds,
    descriptionHtml: changes.description !== undefined ? publicDescription(changes.description) : product.descriptionHtml,
    visibility: changes.visibility ?? product.visibility };
}
