import type { InventoryItem, StoreProductProfile } from "./types";

/** Las cotizaciones guardan peso por unidad; CSSBuy pesa la orden completa. */
export function gramsToKg(grams: unknown): number {
  const n = Number(grams);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000
    ? Number((n / 1000).toFixed(6)) : 0;
}

export function fillInventoryWeights(
  items: InventoryItem[],
  quotes: { productos: { oid?: string; pesoG?: number }[] }[],
  orders: { oid: string; peso_g: number; cantidad: number }[],
): InventoryItem[] {
  const weights = new Map<string, number>();
  // La consulta entrega las cotizaciones de la más reciente a la más antigua.
  for (const quote of quotes) for (const product of quote.productos) {
    const oid = product.oid?.trim();
    const kg = gramsToKg(product.pesoG);
    if (oid && kg && !weights.has(oid)) weights.set(oid, kg);
  }
  for (const order of orders) {
    const kg = gramsToKg(order.peso_g / Math.max(1, order.cantidad));
    if (order.oid && kg && !weights.has(order.oid)) weights.set(order.oid, kg);
  }
  return items.map(item => {
    if (item.tienda?.pesoKg) return item;
    const pesoKg = weights.get(item.origenRef?.trim() ?? "");
    if (!pesoKg) return item;
    const profile: StoreProductProfile = item.tienda ?? {
      descripcion: "", categoria: "", categoriaId: null, fotos: [],
      pesoKg: 0, descuentoPct: 0, redondearA: 0,
    };
    return { ...item, tienda: { ...profile, pesoKg } };
  });
}
