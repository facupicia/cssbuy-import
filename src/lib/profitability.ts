import { calcInventoryItem } from "./inventory";
import type { InventoryItem } from "./types";

export interface SellingCosts {
  feePercent: number;
  shippingARS: number;
  packagingARS: number;
  targetProfitARS: number;
}

export const DEFAULT_SELLING_COSTS: SellingCosts = {
  feePercent: 0, shippingARS: 0, packagingARS: 0, targetProfitARS: 0,
};

/** One unit per order. These are planning limits, never attributed sales. */
export function productAdEconomics(item: InventoryItem, costs: SellingCosts) {
  const calc = calcInventoryItem(item);
  const valid = Number.isFinite(calc.precioVentaARS) && Number.isFinite(calc.costoUnitARS)
    && calc.precioVentaARS > 0 && calc.costoUnitARS > 0;
  const contributionARS = calc.precioVentaARS - calc.costoUnitARS
    - calc.precioVentaARS * costs.feePercent / 100
    - costs.shippingARS - costs.packagingARS;
  return {
    id: item.id,
    name: item.nombre,
    sku: item.sku ?? null,
    stock: calc.stock,
    priceARS: calc.precioVentaARS,
    landedCostARS: calc.costoUnitARS,
    contributionARS: valid ? contributionARS : null,
    breakEvenCpaARS: valid && contributionARS > 0 ? contributionARS : null,
    targetCpaARS: valid ? Math.max(0, contributionARS - costs.targetProfitARS) : null,
    breakEvenRoas: valid && contributionARS > 0 ? calc.precioVentaARS / contributionARS : null,
    canAdvertise: valid && calc.stock > 0 && item.estado === "en_deposito"
      && contributionARS > costs.targetProfitARS,
  };
}

export function parseSellingCosts(params: URLSearchParams): SellingCosts {
  const result = { ...DEFAULT_SELLING_COSTS };
  for (const key of Object.keys(result) as (keyof SellingCosts)[]) {
    const raw = params.get(key);
    if (raw === null) continue;
    if (!raw.trim()) throw new Error(`Valor inválido: ${key}`);
    const value = Number(raw);
    const max = key === "feePercent" ? 100 : 1e9;
    if (!Number.isFinite(value) || value < 0 || value > max) {
      throw new Error(`Valor inválido: ${key}`);
    }
    result[key] = value;
  }
  return result;
}
