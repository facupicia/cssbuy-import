import type { InventoryItem, StoreProductProfile } from "./types";
import { calcInventoryItem } from "./inventory";
import { parseVariante, precioPublicado } from "./tiendanube";
import { canonizar, varianteSinTalle } from "./variantes";
import { descripcionATexto, generarDescripcionTiendaHTML } from "./descripcion";
import { DEFAULT_TRANSFER_DISCOUNT_PCT, newStoreProfile } from "./store-defaults";
import { tablaDeMarca } from "./tablas-talle";

export const EMPTY_STORE_PROFILE: StoreProductProfile = newStoreProfile();

export function validPhoto(value: string): boolean {
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) return value.length <= 700_000;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && value.length <= 2048;
  } catch { return false; }
}

export function sanitizeStoreProfile(raw: unknown): StoreProductProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Ficha de tienda inválida");
  const r = raw as Record<string, unknown>;
  const text = (key: string, max: number) => typeof r[key] === "string" ? r[key].trim().slice(0, max) : "";
  const number = (key: string, max: number) => {
    const n = Number(r[key] ?? (key === "descuentoPct" ? DEFAULT_TRANSFER_DISCOUNT_PCT : 0));
    if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`Valor inválido: ${key}`);
    return n;
  };
  const fotos = r.fotos ?? [];
  if (!Array.isArray(fotos) || fotos.length > 9 || fotos.some(f => typeof f !== "string" || !validPhoto(f))) {
    throw new Error("Usá hasta 9 fotos JPG, PNG o WebP, o enlaces HTTPS válidos");
  }
  const categoriaId = r.categoriaId == null ? null : Number(r.categoriaId);
  if (categoriaId !== null && (!Number.isSafeInteger(categoriaId) || categoriaId <= 0)) throw new Error("Categoría inválida");
  return { descripcion: text("descripcion", 10000), categoria: text("categoria", 200), categoriaId,
    fotos: [...new Set(fotos)], pesoKg: number("pesoKg", 1000),
    descuentoPct: number("descuentoPct", 90), redondearA: number("redondearA", 100000) };
}

export function storePhotos(item: InventoryItem) {
  return [...new Set([...(item.tienda?.fotos ?? []), ...(item.imagen && !item.tienda?.fotos.length ? [item.imagen] : [])])];
}

export function storeVariants(item: InventoryItem) {
  const c = calcInventoryItem(item);
  const p = item.tienda ?? EMPTY_STORE_PROFILE;
  const price = precioPublicado(c.precioVentaARS, p.redondearA, p.descuentoPct);
  let extra = parseVariante(item.variante).filter(p => p.nombre !== "Talle");
  if (extra.length === 1 && extra[0].nombre === "Variante" && c.tallesCalc) {
    const color = varianteSinTalle(item.variante);
    extra = color ? [{ nombre: "Color", valor: color }] : [];
  }
  const rows = c.tallesCalc?.map(t => ({
    sku: t.sku || `${item.sku || `PLUG-${item.id}`}-${canonizar(t.talle)}`,
    stock: t.stock, props: [{ nombre: "Talle", valor: t.talle }, ...extra].slice(0, 3),
  })) ?? [{ sku: item.sku || `PLUG-${item.id}`, stock: c.stock, props: parseVariante(item.variante) }];
  return rows.map(r => ({ ...r, price, weight: p.pesoKg }));
}

export function storeReadiness(item: InventoryItem, brand?: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!item.nombre.trim()) errors.push("Falta el nombre");
  if (!Number.isFinite(item.precioVentaARS) || item.precioVentaARS <= 0) errors.push("Definí un precio de venta mayor a cero");
  const photos = storePhotos(item);
  if (!photos.length) errors.push("Agregá al menos una foto");
  if (photos.some(f => !validPhoto(f))) errors.push("Revisá los enlaces de las fotos: deben usar HTTPS");
  if (!descripcionATexto(generarDescripcionTiendaHTML(item, brand))) errors.push("No se pudo generar la descripción pública");
  if (!item.tienda?.categoria.trim() && !item.tienda?.categoriaId) errors.push("Elegí una categoría");
  if (!brand) errors.push("Asigná una marca");
  if (!tablaDeMarca(brand)) warnings.push("Falta la tabla de talles de esta marca. Cargá las medidas del proveedor antes de publicar.");
  if (item.estado === "en_transito") errors.push("El producto sigue en tránsito");
  if (!item.tienda?.pesoKg) errors.push("Cargá el peso para calcular envíos");
  const quantities = item.talles?.length ? item.talles : [item];
  if (quantities.some(t => !Number.isInteger(t.cantidadInicial) || !Number.isInteger(t.cantidadVendida)
    || t.cantidadInicial < 0 || t.cantidadVendida < 0 || t.cantidadVendida > t.cantidadInicial)) errors.push("Revisá las cantidades: deben ser enteras y las ventas no pueden superar las unidades recibidas");
  const variants = storeVariants(item);
  if (new Set(variants.map(v => v.sku)).size !== variants.length) errors.push("Hay SKU repetidos entre los talles");
  if (calcInventoryItem(item).stock === 0) warnings.push("Sin stock: se enviarán cero unidades disponibles");
  if (item.costoUnitARS <= 0) warnings.push("Falta el costo: no se puede evaluar el margen");
  else if (item.precioVentaARS <= item.costoUnitARS) warnings.push("El precio de venta no supera el costo");
  if (!item.sku) warnings.push("Se usará un SKU estable generado por el panel");
  return { errors, warnings, ready: errors.length === 0 };
}

export function publicDescription(text: string) {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text.split(/\n\s*\n/).map(p => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
}
