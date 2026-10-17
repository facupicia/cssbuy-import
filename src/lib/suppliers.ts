export type SupplierType = "vendedor" | "fabrica";
export type SupplierInput = { nombre: string; tipo: SupplierType; categoria: string; tiendaUrl: string; referenciaUrl: string; contacto: string; notas: string; favorito: boolean };
export type Supplier = SupplierInput & { id: string; version: number; createdAt: string; updatedAt: string };
export const EMPTY_SUPPLIER: SupplierInput = { nombre: "", tipo: "vendedor", categoria: "", tiendaUrl: "", referenciaUrl: "", contacto: "", notas: "", favorito: false };

export function supplierUrl(value: string) {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) throw new Error();
    url.hash = "";
    return url.toString();
  } catch { throw new Error("Usá un enlace completo que empiece con https:// o http://."); }
}
export function parseSupplier(value: unknown): SupplierInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Revisá los datos del proveedor.");
  const source = value as Record<string, unknown>;
  const field = (key: string, max: number) => {
    if (source[key] !== undefined && typeof source[key] !== "string") throw new Error("Revisá los datos del proveedor.");
    const text = ((source[key] as string) ?? "").trim();
    if (text.length > max) throw new Error(`${key === "notas" ? "La nota" : "El campo " + key} supera los ${max} caracteres.`);
    return text;
  };
  const nombre = field("nombre", 120);
  if (!nombre) throw new Error("Escribí el nombre del vendedor o fábrica.");
  if (source.tipo !== "vendedor" && source.tipo !== "fabrica") throw new Error("Elegí vendedor o fábrica.");
  if (typeof source.favorito !== "boolean") throw new Error("Revisá la selección de favorito.");
  return { nombre, tipo: source.tipo, categoria: field("categoria", 80), tiendaUrl: supplierUrl(field("tiendaUrl", 2048)), referenciaUrl: supplierUrl(field("referenciaUrl", 2048)), contacto: field("contacto", 300), notas: field("notas", 4000), favorito: source.favorito };
}
export function supplierVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error("Recargá la agenda antes de guardar los cambios.");
  return value as number;
}
export function filterSuppliers(items: Supplier[], search: string, tipo: string, categoria: string, favoritos: boolean) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const query = normalize(search.trim());
  return items.filter(item => (!tipo || item.tipo === tipo) && (!categoria || item.categoria === categoria) && (!favoritos || item.favorito)
    && (!query || normalize([item.nombre, item.categoria, item.contacto, item.notas, item.tiendaUrl, item.referenciaUrl].join(" ")).includes(query)))
    .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre, "es"));
}
