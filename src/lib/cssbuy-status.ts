import type { CssbuyOrder } from "./types";

// Códigos del filtro del sitio CSSBuy: Pending=1,2,3; Warehouse=4,7;
// Submited=5; Invalid=6; Unpaid=0.
const labels: Record<string, string> = { "0": "No pagado", "1": "En proceso", "2": "En proceso", "3": "En proceso",
  "4": "En almacén", "5": "Enviado", "6": "Inválido", "7": "En almacén" };
const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const invalid = /invalid|cancel|refund|reembols|return|devuelt|devoluc|closed|cerrad|reject|unpaid|no pagado|sin pagar|non.payment|out of stock|sin stock|agotado|expired|fail|problem|after.sales|无效|取消|退款|退货|关闭|失效|缺货|未付款|异常|删除|拒绝|失败/;
function status(order: unknown): unknown {
  if (!order || typeof order !== "object") return order;
  const o = order as Record<string, any>; const raw = o.raw ?? o;
  return o.estado ?? raw.state ?? raw.status ?? raw.orderState ?? raw.order_state ?? raw.goods_status ?? raw.order_status
    ?? raw.statename ?? raw.stateName ?? raw.status_name ?? raw.statusName;
}
function validStatus(value: unknown) {
  const s = normalize(value);
  if (!s || s === "null" || s === "undefined" || invalid.test(s)) return false;
  return /^-?\d+$/.test(s) ? ["1", "2", "3", "4", "5", "7"].includes(s) : true;
}
export function isValidCssbuyOrder(order: unknown): boolean {
  if (order && typeof order === "object") {
    const o = order as Record<string, any>; const raw = o.raw ?? o;
    const state = raw.state ?? raw.status ?? raw.orderState ?? raw.order_state;
    if (state != null && !validStatus(state)) return false;
    for (const source of [o, raw]) {
      if ([source.is_del, source.isdel, source.is_delete, source.deleted].some(v => v === true || String(v) === "1" || String(v) === "true")) return false;
      if ([source.cancel_status, source.cancelStatus, source.refund_status, source.refundStatus].some(v => ["1", "2"].includes(String(v)))) return false;
    }
  }
  return validStatus(status(order));
}
export function cssbuyOrderGroup(order: unknown): "warehouse" | "shipped" | "process" | "other" {
  const s = normalize(status(order));
  if (["4", "7"].includes(s)) return "warehouse";
  if (s === "5") return "shipped";
  if (["1", "2", "3"].includes(s) || /to warehouse|al almacen/.test(s)) return "process";
  if (/warehouse|almacen|arrived|入库|到仓/.test(s)) return "warehouse";
  if (/enviado|shipped|submitted|submited|dispatched|已发货/.test(s)) return "shipped";
  if (/process|proces|pending|pendiente|paid|pago|order|en camino|订购|付款|待/.test(s)) return "process";
  return "other";
}
export function cssbuyStateLabel(order: unknown): string {
  const value = String(status(order) ?? "").trim();
  if (labels[value]) return labels[value];
  const group = cssbuyOrderGroup(order);
  return group === "warehouse" ? "En almacén" : group === "shipped" ? "Enviado" : group === "process" ? "En proceso" : value || "Sin estado";
}
export function normalizeCssbuyOrders(orders: CssbuyOrder[]): CssbuyOrder[] {
  return orders.filter(isValidCssbuyOrder).map(o => ({ ...o, estado: cssbuyStateLabel(o) }));
}
