import type { InventoryItem } from "./types";
import { newStoreProfile } from "./store-defaults";

export interface StoreCategory { id: number; name: string }

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const rules: [string, RegExp][] = [
  ["Remeras", /\b(remeras?|camisetas?|t shirts?|tshirts?|tees?)\b/],
  ["Buzos", /\b(buzos?|hoodies?|sweatshirts?)\b/],
  ["Camperas", /\b(camperas?|chaquetas?|jackets?|abrigos?)\b/],
  ["Pantalones", /\b(pantalon(?:es)?|joggers?|jeans?|trousers?)\b/],
  ["Shorts", /\b(shorts?|bermudas?)\b/],
  ["Camisas", /\b(camisas?)\b/],
  ["Chalecos", /\b(chalecos?)\b/],
  ["Musculosas", /\b(musculosas?)\b/],
  ["Sweaters", /\b(sweaters?|sueter(?:es)?|pullover(?:es)?)\b/],
  ["Conjuntos", /\b(conjuntos?|tracksuits?)\b/],
  ["Zapatillas", /\b(zapatillas?|sneakers?)\b/],
  ["Gorras", /\b(gorras?|caps?)\b/],
  ["Medias", /\b(medias?|socks?)\b/],
  ["Vestidos", /\b(vestidos?)\b/],
  ["Polleras", /\b(polleras?|faldas?)\b/],
  ["Mochilas", /\b(mochilas?|backpacks?)\b/],
  ["Accesorios", /\b(accesorios?)\b/],
];

export function inferCategoryName(name: string): string | null {
  const matches = rules.filter(([, pattern]) => pattern.test(normalize(name)));
  return matches.length === 1 ? matches[0][0] : null;
}

/** Completa solo lo que falta; una elección manual siempre tiene prioridad. */
export function withStoreCategory<T extends Pick<InventoryItem, "nombre" | "tienda">>(item: T, categories: StoreCategory[] = []): T {
  if (item.tienda?.categoriaId) return item;
  const profile = item.tienda ?? newStoreProfile();
  let name = profile.categoria.trim() || inferCategoryName(item.nombre) || "";
  const leaf = (value: string) => normalize(value.split(/>|\//).at(-1) ?? value);
  let candidates = name ? categories.filter(c => leaf(c.name) === leaf(name)) : [];
  if (!candidates.length && name) {
    const group = inferCategoryName(name);
    if (group) candidates = categories.filter(c => inferCategoryName(c.name) === group);
  }
  // También admite categorías propias cuyos nombres figuren en el producto.
  if (!name) {
    const title = ` ${normalize(item.nombre)} `;
    candidates = categories.filter(c => {
      const term = leaf(c.name);
      return term.length > 2 && title.includes(` ${term} `);
    });
  }
  const category = candidates.length === 1 ? candidates[0] : null;
  if (category) name = category.name;
  if (!name && !category) return item;
  return { ...item, tienda: { ...profile, categoria: name, categoriaId: category?.id ?? null } };
}
