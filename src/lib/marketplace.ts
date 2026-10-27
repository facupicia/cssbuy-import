import type { InventoryItem } from "./types";
import { calcInventoryItem } from "./inventory";
import { parseColor, parseTalle, compararTalles, varianteSinTalle } from "./variantes";
import { storePhotos } from "./store-product";

export const MARKETPLACE_CONDITIONS = ["Nuevo", "Usado - Como nuevo", "Usado - Buen estado", "Usado - Aceptable"] as const;
export const MARKETPLACE_CATEGORIES = ["Ropa y calzado de hombre", "Ropa y calzado de mujer", "Bebés y niños", "Joyas y accesorios", "Bolsos y equipaje"] as const;
export type MarketplaceStatus = "draft" | "sent" | "published" | "sold" | "archived";
export interface MarketplaceInput {
  itemId: string; sourceVersion: string; title: string; description: string;
  price: number; condition: string; category: string; location: string;
}
export interface MarketplaceDraft extends MarketplaceInput {
  id: string; status: MarketplaceStatus; listingUrl: string | null; revision: number;
  sentAt: string | null; updatedAt: string; needsUpdate: boolean;
}
export interface MarketplaceProduct {
  id: string; name: string; price: number; stock: number; sizes: string[];
  photos: string[]; version: string; issues: string[]; generated: MarketplaceInput;
}
export interface MarketplacePhoto { source: string; name: string }
export interface MarketplacePayload {
  protocol: 1; handoffId: string; itemId: string; sourceVersion: string; revision: number; createdAt: string;
  title: string; description: string; price: number; condition: string;
  category: string; location: string; photos: MarketplacePhoto[];
}
export const marketplaceUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const compact = (s: string) => s.replace(/\s+/g, " ").trim();
const folded = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function containsWords(text: string, value: string) { return (` ${folded(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `).includes(` ${folded(value).replace(/[^\p{L}\p{N}]+/gu, " ")} `); }

/** Export only public selling fields. Internal notes, costs and source links never enter a listing. */
export function marketplaceProduct(item: InventoryItem, brand = ""): MarketplaceProduct {
  const c = calcInventoryItem(item);
  const sizes = [...new Set(c.tallesCalc ? c.tallesCalc.filter(t => t.stock > 0).map(t => t.talle) : c.stock > 0 ? [parseTalle(item.variante)].filter((s): s is string => Boolean(s)) : [])].sort(compararTalles);
  const freeColor = varianteSinTalle(item.variante);
  const color = parseColor(item.variante) || (freeColor && /^[\p{L} ]{2,24}$/u.test(freeColor) ? freeColor : "");
  let title = compact(item.nombre);
  if (brand && !containsWords(title, brand)) title += ` ${compact(brand)}`;
  const colorForms = color ? [color, ...(/o$/i.test(color) ? [color.slice(0, -1) + "a"] : /a$/i.test(color) ? [color.slice(0, -1) + "o"] : [])] : [];
  if (color && !colorForms.some(value => containsWords(title, value))) title += ` ${color.toLocaleLowerCase("es")}`;
  const sizeLabel = sizes.length ? `${sizes.length === 1 ? "talle" : "talles"} ${sizes.join(" / ")}` : "";
  // Preserve the distinguishing size suffix if an imported product has a long name.
  title = compact(title).slice(0, Math.max(1, 100 - (sizeLabel ? sizeLabel.length + 1 : 0))).trim() + (sizeLabel ? ` ${sizeLabel}` : "");
  const description = [sizes.length ? `${sizes.length === 1 ? "Talle" : "Talles"} ${sizes.join(" / ")}.` : "", "Retiro en Rosario. Consultá por envío.", "Más fotos e info en Instagram: @theplug.ros"].filter(Boolean).join("\n");
  const photos = storePhotos(item).slice(0, 9);
  const issues: string[] = [];
  if (!title.trim()) issues.push("Falta el nombre del producto.");
  if (c.stock <= 0 || item.estado === "agotado") issues.push("Sin unidades disponibles.");
  if (item.estado === "en_transito") issues.push("El producto todavía está en tránsito.");
  if (!Number.isFinite(c.precioVentaARS) || c.precioVentaARS <= 0) issues.push("Falta un precio de venta válido en el inventario.");
  if (!photos.length) issues.push("Agregá una foto al producto.");
  return { id: item.id, name: item.nombre, price: c.precioVentaARS, stock: c.stock, sizes, photos, version: item.updatedAt, issues,
    generated: { itemId: item.id, sourceVersion: item.updatedAt, title, description, price: c.precioVentaARS, condition: "", category: "Ropa y calzado de hombre", location: "Rosario" } };
}

export function parseMarketplaceInput(raw: unknown): MarketplaceInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Revisá la publicación.");
  const r = raw as Record<string, unknown>;
  const text = (key: string, max: number, required = true) => {
    const v = r[key];
    if (typeof v !== "string" || v.length > max || (required && !v.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error(`Revisá el campo ${key}.`);
    return v.trim();
  };
  if (!marketplaceUuid(r.itemId)) throw new Error("El producto no es válido.");
  const sourceVersion = text("sourceVersion", 64);
  if (!/^\d{4}-\d\d-\d\dT/.test(sourceVersion) || !Number.isFinite(Date.parse(sourceVersion))) throw new Error("Actualizá el producto antes de guardar.");
  if (typeof r.price !== "number" || !Number.isFinite(r.price) || r.price <= 0 || r.price > 99999999 || Math.abs(r.price * 100 - Math.round(r.price * 100)) > 0.00001) throw new Error("Ingresá un precio válido en pesos, con hasta dos decimales.");
  const condition = text("condition", 40, false), category = text("category", 80, false);
  if (condition && !(MARKETPLACE_CONDITIONS as readonly string[]).includes(condition)) throw new Error("Elegí el estado real de la prenda.");
  if (category && !(MARKETPLACE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Elegí una categoría de la lista.");
  return { itemId: r.itemId, sourceVersion, title: text("title", 100), description: text("description", 1500), price: r.price,
    condition, category, location: text("location", 80) };
}

export function marketplaceListingUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 1000) throw new Error("Pegá el enlace de la publicación de Marketplace.");
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("Pegá un enlace válido de Marketplace."); }
  const match = url.pathname.match(/^\/marketplace\/item\/(\d+)\/?$/);
  if (url.protocol !== "https:" || !["www.facebook.com", "facebook.com", "m.facebook.com"].includes(url.hostname) || url.port || url.username || url.password || !match) throw new Error("Usá el enlace de un artículo de Facebook Marketplace.");
  return `https://www.facebook.com/marketplace/item/${match[1]}/`;
}

export function marketplaceNeedsReview(product: MarketplaceProduct | undefined, draft: MarketplaceDraft) {
  return draft.needsUpdate || !product || product.version !== draft.sourceVersion || product.issues.length > 0;
}
