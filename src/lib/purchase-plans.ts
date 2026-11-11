import type { Cotizacion, Product } from "./types";
import { calcularTodo } from "./utils";
import { supplierUrl } from "./suppliers";

export interface PlanLine {
  id: string;
  url: string;
  nombre: string;
  variante: string;
  cantidad: number;
  precioCNY: number | null;
  envioChinaCNY: number;
  pesoG: number | null;
  ventaARS: number | null;
  leidoEn: string | null;
}
export interface PlanInput {
  nombre: string;
  notas: string;
  estado: "borrador" | "listo" | "archivado";
  lineas: PlanLine[];
  usdARS: number;
  cnyUSD: number;
  fleteUSD: number | null;
  comisionPct: number;
  impuestosUSD: number | null;
  extraUSD: number;
  presupuestoARS: number | null;
}
export interface PurchasePlan extends PlanInput {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Retain the product identity, discard tracking and fragments. Never fetch arbitrary URLs. */
export function cssbuyProductUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Pegá un enlace completo de un producto de CSSBuy."); }
  if (url.protocol !== "https:" || !["www.cssbuy.com", "cssbuy.com"].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== "/shop/goodsDetail") throw new Error("Usá el enlace de la ficha de un producto de CSSBuy.");
  const id = url.searchParams.get("id");
  const type = url.searchParams.get("type");
  if (!id || !/^\d{1,30}$/.test(id) || !type || !/^[a-zA-Z0-9_]{1,30}$/.test(type)) throw new Error("Al enlace de CSSBuy le falta el producto o la plataforma de origen.");
  return `https://www.cssbuy.com/shop/goodsDetail?id=${id}&type=${type}`;
}
/** References may come from a saved supplier, inventory, or an original marketplace. No server fetch. */
export function planProductUrl(value: string): string {
  const url = supplierUrl(value);
  if (!url) throw new Error("Agregá el enlace del producto.");
  try { return cssbuyProductUrl(url); } catch { return url; }
}
export function canReadCssbuyProduct(value: string) {
  try { cssbuyProductUrl(value); return true; } catch { return false; }
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Revisá los datos del pedido.");
  return input as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`Revisá ${label}.`);
  return value.trim();
}
function number(value: unknown, label: string, max: number, nullable = false, positive = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (positive && value <= 0)) throw new Error(`Revisá ${label}.`);
  return value;
}
export function planIdentity(value: unknown) {
  const input = object(value);
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) || !Number.isSafeInteger(input.version) || Number(input.version) < 1) throw new Error("Recargá el pedido antes de guardar.");
  return { id: input.id, version: Number(input.version) };
}
export function parsePlan(value: unknown): PlanInput {
  const input = object(value);
  if (typeof input.estado !== "string" || !["borrador", "listo", "archivado"].includes(input.estado)) throw new Error("Revisá el estado del pedido.");
  if (!Array.isArray(input.lineas) || input.lineas.length > 100) throw new Error("Cada pedido admite hasta 100 variantes.");
  const ids = new Set<string>();
  const lineas = input.lineas.map(raw => {
    const line = object(raw);
    const id = text(line.id, "la variante", 100, true);
    if (ids.has(id)) throw new Error("Hay variantes con el mismo identificador.");
    ids.add(id);
    const cantidad = number(line.cantidad, "la cantidad", 10000, false, true)!;
    if (!Number.isInteger(cantidad)) throw new Error("La cantidad debe ser un número entero.");
    const leidoEn = line.leidoEn === null ? null : text(line.leidoEn, "la fecha de lectura", 40);
    if (leidoEn !== null && !Number.isFinite(Date.parse(leidoEn))) throw new Error("Revisá la fecha de lectura.");
    return {
      id, url: planProductUrl(text(line.url, "el enlace", 2048, true)),
      nombre: text(line.nombre, "el nombre del producto", 200), variante: text(line.variante, "el talle o color", 200), cantidad,
      precioCNY: number(line.precioCNY, "el precio en yuanes", 1000000, true, true),
      envioChinaCNY: number(line.envioChinaCNY, "el envío en China", 1000000)!,
      pesoG: number(line.pesoG, "el peso por unidad", 1000000, true, true),
      ventaARS: number(line.ventaARS, "el precio de venta", 1000000000, true, true), leidoEn,
    };
  });
  const result: PlanInput = {
    nombre: text(input.nombre, "el nombre del pedido", 120, true), notas: text(input.notas, "las notas", 4000),
    estado: input.estado as PlanInput["estado"], lineas,
    usdARS: number(input.usdARS, "el dólar en pesos", 1000000, false, true)!,
    cnyUSD: number(input.cnyUSD, "los yuanes por dólar", 1000000, false, true)!,
    fleteUSD: number(input.fleteUSD, "el flete internacional", 1000000, true),
    comisionPct: number(input.comisionPct, "la comisión", 100)!,
    impuestosUSD: number(input.impuestosUSD, "los impuestos estimados", 1000000, true),
    extraUSD: number(input.extraUSD, "los gastos adicionales", 1000000)!,
    presupuestoARS: number(input.presupuestoARS, "el presupuesto", 10000000000, true),
  };
  if (result.estado === "listo" && planMissing(result).length) throw new Error("Completá precios, pesos, flete e impuestos antes de marcar el pedido como listo.");
  return result;
}

export function planMissing(plan: PlanInput): string[] {
  const missing: string[] = [];
  if (!plan.lineas.length) missing.push("productos");
  if (plan.lineas.some(line => !line.nombre.trim())) missing.push("nombres de producto");
  if (plan.lineas.some(line => !line.precioCNY)) missing.push("precios");
  if (plan.lineas.some(line => !line.pesoG)) missing.push("pesos");
  if (plan.fleteUSD === null) missing.push("flete internacional");
  if (plan.impuestosUSD === null) missing.push("impuestos estimados");
  return missing;
}

export function planProducts(plan: PlanInput): Product[] {
  return plan.lineas.map(line => ({
    id: line.id, nombre: [line.nombre || "Producto por definir", line.variante].filter(Boolean).join(" · "),
    link: line.url, cantidad: line.cantidad, precioCNY: line.precioCNY ?? 0,
    // Domestic shipping is a LINE TOTAL in this planner. The calculator expects a UNIT amount.
    envioLocalCNY: line.envioChinaCNY / line.cantidad, envioChinaCNY: 0,
    pesoG: line.pesoG ?? 0, precioVentaUSD: 0, precioVentaARS: line.ventaARS ?? undefined,
  }));
}
export function planQuote(plan: PlanInput, id = ""): Cotizacion {
  const fx = { blue: plan.usdARS, oficial: plan.usdARS, mep: plan.usdARS, cny: plan.cnyUSD };
  // All tax figures are explicitly supplied estimates; do not infer customs rules.
  const envio = { freightUSD: (plan.fleteUSD ?? 0) + plan.extraUSD, depositFeePct: plan.comisionPct / 100, markup: 2 };
  const aduana = { dentroFranquicia: false, enviosAnio: 0, ivaPct: 0, iibbPct: 0, valorDeclaradoUSD: null, pagoNetoImpuestosUSD: plan.impuestosUSD ?? 0 };
  const productos = planProducts(plan);
  return { id, fecha: new Date().toISOString(), nombre: plan.nombre, fx, envio, aduana, productos, resultados: calcularTodo(productos, fx, envio, aduana) };
}

export function newPlan(usdARS: number, cnyUSD: number, comisionPct: number): PlanInput {
  return { nombre: "Próximo pedido", notas: "", estado: "borrador", lineas: [], usdARS, cnyUSD, comisionPct, fleteUSD: null, impuestosUSD: null, extraUSD: 0, presupuestoARS: null };
}
export function newPlanLine(url: string): PlanLine {
  return { id: crypto.randomUUID(), url: planProductUrl(url), nombre: "", variante: "", cantidad: 1, precioCNY: null, envioChinaCNY: 0, pesoG: null, ventaARS: null, leidoEn: null };
}
