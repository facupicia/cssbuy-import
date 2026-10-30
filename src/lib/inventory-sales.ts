export const SALES_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function salesToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SALES_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-");
}

export class InventorySaleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface SaleInput {
  requestId: string;
  itemId: string;
  fecha: string;
  unidades: number;
  precioUnitARS: number;
  talle: string;
  anterior: boolean;
}

export function validateSale(raw: Record<string, unknown>): SaleInput {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof raw.requestId !== "string" || !uuid.test(raw.requestId) || typeof raw.itemId !== "string" || !uuid.test(raw.itemId)) throw new InventorySaleError("Identificador de venta o producto inválido.");
  const fecha = typeof raw.fecha === "string" ? raw.fecha : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha || fecha < "1900-01-01" || fecha > salesToday()) throw new InventorySaleError("Elegí una fecha válida, hasta hoy.");
  if (typeof raw.unidades !== "number" || !Number.isSafeInteger(raw.unidades) || raw.unidades < 1) throw new InventorySaleError("Las unidades deben ser un número entero mayor a cero.");
  if (typeof raw.precioUnitARS !== "number" || !Number.isFinite(raw.precioUnitARS) || raw.precioUnitARS < 0 || raw.precioUnitARS > 999999999 || Math.abs(raw.precioUnitARS * 100 - Math.round(raw.precioUnitARS * 100)) > 0.0001) throw new InventorySaleError("Ingresá un precio válido en pesos, con hasta dos decimales.");
  if (raw.anterior !== undefined && typeof raw.anterior !== "boolean") throw new InventorySaleError("Tipo de registro inválido.");
  if (raw.talle !== undefined && (typeof raw.talle !== "string" || raw.talle.length > 80)) throw new InventorySaleError("Talle inválido.");
  return { requestId: raw.requestId, itemId: raw.itemId, fecha, unidades: raw.unidades, precioUnitARS: raw.precioUnitARS, talle: String(raw.talle || ""), anterior: raw.anterior === true };
}

export interface InventorySalesReport {
  meses: { mes: string; facturadoARS: number; unidades: number }[];
  ventas: { id: string; fecha: string; nombre: string; talle: string; unidades: number; precioUnitARS: number; totalARS: number }[];
  pendientes: { itemId: string; talle: string; unidades: number }[];
  discrepancias: number;
}
