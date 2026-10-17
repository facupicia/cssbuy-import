import type { InventoryItem } from "./types";
import { calcInventoryItem } from "./inventory";
import { canonizar, parseColor, itemTieneTalle } from "./variantes";
import { inferCategoryName } from "./store-category";

export interface InventoryFilters {
  estados: string[];
  marcas: string[];
  talles: string[];
  colores: string[];
  categorias: string[];
  origenes: string[];
  stock: string[];
  precioMin: string;
  precioMax: string;
}
export const EMPTY_INVENTORY_FILTERS: InventoryFilters = {
  estados: [], marcas: [], talles: [], colores: [], categorias: [], origenes: [], stock: [], precioMin: "", precioMax: "",
};
export const categoriaInventario = (item: InventoryItem) => item.tienda?.categoria?.trim() || inferCategoryName(item.nombre) || "Sin categoría";
export const colorInventario = (item: InventoryItem) => parseColor(item.variante) || "Sin color";
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Options within a group match ANY; distinct filter groups must ALL match. */
export function filtrarInventario(items: InventoryItem[], filters: InventoryFilters, search = ""): InventoryItem[] {
  const q = normalize(search.trim());
  const matches = (values: string[], value: string) => !values.length || values.includes(value);
  return items.filter(item => {
    if (!matches(filters.estados, item.estado) || !matches(filters.marcas, item.marcaId || "sin_marca") ||
        !matches(filters.colores, colorInventario(item)) || !matches(filters.categorias, categoriaInventario(item)) ||
        !matches(filters.origenes, item.origen)) return false;
    if (filters.talles.length && !filters.talles.some(t => itemTieneTalle(item, t))) return false;
    // With a size filter, availability refers to those sizes, never another size's stock.
    const stock = filters.talles.length && item.talles?.length
      ? item.talles.filter(t => filters.talles.some(v => canonizar(v) === canonizar(t.talle)))
        .reduce((sum, t) => sum + Math.max(0, t.cantidadInicial - t.cantidadVendida), 0)
      : calcInventoryItem(item).stock;
    if (filters.stock.length && !filters.stock.some(s => s === "disponible" ? stock > 0 : s === "bajo" ? stock > 0 && stock <= 3 : stock === 0)) return false;
    if (filters.precioMin !== "" && item.precioVentaARS < Number(filters.precioMin)) return false;
    if (filters.precioMax !== "" && item.precioVentaARS > Number(filters.precioMax)) return false;
    return !q || [item.nombre, item.sku || "", item.variante || "", colorInventario(item),
      ...(item.talles || []).flatMap(t => [t.talle, t.sku || ""])]
      .some(value => normalize(value).includes(q));
  });
}

export function paginarInventario<T>(items: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize) || 20);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(1, Math.min(Math.floor(page) || 1, pages));
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages, from: items.length ? start + 1 : 0, to: Math.min(start + size, items.length), total: items.length };
}
