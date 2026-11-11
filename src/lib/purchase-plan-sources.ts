import { newPlanLine, planProductUrl, type PlanLine } from "./purchase-plans";
import type { Supplier } from "./suppliers";
import type { Cotizacion, CssbuyOrder, InventoryItem } from "./types";
import type { PurchasePlan } from "./purchase-plans";

export const SOURCE_LABELS = { proveedores: "Proveedores", inventario: "Inventario", cssbuy: "Pedidos CSSBuy", cotizaciones: "Cotizaciones", pedidos: "Pedidos guardados" } as const;
export type SavedLinkSource = keyof typeof SOURCE_LABELS;
export interface SavedProductLink {
  id: string; source: SavedLinkSource; parentId: string; nombre: string; variante: string; url: string;
  detail: string; kind: "producto" | "catalogo";
}
export interface SavedLinksResult { links: SavedProductLink[]; warnings: string[] }
function safeUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return "";
  try { return planProductUrl(value); } catch { return ""; }
}
const label = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 200) : "";
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
export function sourceLinks(source: SavedLinkSource, input: unknown[]): SavedProductLink[] {
  const result: SavedProductLink[] = [];
  function add(parentId: string, suffix: string, nombre: string, variante: string, url: unknown, detail: string, kind: "producto" | "catalogo" = "producto") {
    const link = safeUrl(url);
    if (link) result.push({ id: `${source}:${parentId}:${suffix}`, source, parentId, nombre: label(nombre), variante: label(variante), url: link, detail: label(detail), kind });
  }
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    if (source === "proveedores") {
      const item = raw as Supplier;
      add(item.id, "ref", "", "", item.referenciaUrl, `Producto de referencia · ${item.nombre}`);
      add(item.id, "catalogo", item.nombre, "", item.tiendaUrl, `Tienda o catálogo · ${item.categoria || item.nombre}`, "catalogo");
    } else if (source === "inventario") {
      const item = raw as InventoryItem;
      const sizes = Array.isArray(item.talles) && item.talles.length ? item.talles.map(size => size.talle) : [""];
      sizes.forEach((size, index) => add(item.id, String(index), item.nombre, [item.variante, size].filter(Boolean).join(" · "), item.link, [item.sku, "Producto del inventario"].filter(Boolean).join(" · ")));
    } else if (source === "cssbuy") {
      const item = raw as CssbuyOrder;
      add(item.oid, "producto", item.producto, item.variante, item.url, `Pedido CSSBuy ${item.oid}`);
    } else if (source === "cotizaciones") {
      const item = raw as Cotizacion;
      if (Array.isArray(item.productos)) item.productos.forEach((product, index) => {
        if (product && typeof product === "object") add(item.id, String(index), product.nombre, "", product.link, item.nombre);
      });
    } else {
      const item = raw as PurchasePlan;
      if (item.estado !== "archivado" && Array.isArray(item.lineas)) item.lineas.forEach((line, index) => {
        if (line && typeof line === "object") add(item.id, String(index), line.nombre, line.variante, line.url, item.nombre);
      });
    }
  }
  return result;
}
export function filterSavedLinks(items: SavedProductLink[], source: SavedLinkSource, query: string, currentPlanId = "") {
  const search = normalize(query);
  return items.filter(item => item.source === source && !(source === "pedidos" && item.parentId === currentPlanId)
    && (!search || normalize([item.nombre, item.variante, item.detail, item.url].join(" ")).includes(search)));
}
export function appendSavedLinks(existing: PlanLine[], selected: SavedProductLink[]) {
  const key = (line: { url: string; variante: string }) => `${planProductUrl(line.url)}\n${normalize(line.variante)}`;
  const seen = new Set(existing.map(key));
  const added: PlanLine[] = [];
  let skipped = 0;
  for (const item of selected) {
    if (item.kind !== "producto") continue;
    const candidate = { ...newPlanLine(item.url), nombre: item.nombre, variante: item.variante };
    const identity = key(candidate);
    if (seen.has(identity)) { skipped++; continue; }
    seen.add(identity); added.push(candidate);
  }
  if (existing.length + added.length > 100) throw new Error("Cada pedido admite hasta 100 variantes. Elegí menos productos.");
  return { lineas: [...existing, ...added], added: added.length, skipped };
}
