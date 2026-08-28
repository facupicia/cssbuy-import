import { CssbuyOrder, FxRates, ShipmentCosts, AduanaConfig, Product, Cotizacion } from "./types";
import { calcularTodo } from "./utils";

export const CALC_CONFIG_KEY = "cssbuy-calc-config";
export const CSSBUY_DEPOSIT_FEE_PCT = 0.053;

export interface CalcConfig {
  fx: FxRates;
  envio: ShipmentCosts;
  aduana: AduanaConfig;
}

export const DEFAULT_CALC_CONFIG: CalcConfig = {
  fx: { blue: 1300, oficial: 1100, mep: 1200, cny: 7.2 },
  envio: {
    freightUSD: 0,
    depositFeePct: CSSBUY_DEPOSIT_FEE_PCT,
    markup: 2.0,
  },
  aduana: {
    dentroFranquicia: false,
    enviosAnio: 0,
    ivaPct: 0.21,
    iibbPct: 0.03,
    valorDeclaradoUSD: null,
    pagoNetoImpuestosUSD: null,
  },
};

export function loadCalcConfig(): CalcConfig {
  if (typeof window === "undefined") return DEFAULT_CALC_CONFIG;
  try {
    const raw = localStorage.getItem(CALC_CONFIG_KEY);
    if (!raw) return DEFAULT_CALC_CONFIG;
    const parsed = JSON.parse(raw);
    const storedDepositFeePct = parsed.envio?.depositFeePct;
    const depositFeePct = typeof storedDepositFeePct === "number"
      ? (storedDepositFeePct === 0.03 || storedDepositFeePct === 0.04
        ? CSSBUY_DEPOSIT_FEE_PCT
        : storedDepositFeePct)
      : DEFAULT_CALC_CONFIG.envio.depositFeePct;
    return {
      fx: { ...DEFAULT_CALC_CONFIG.fx, ...parsed.fx },
      envio: { ...DEFAULT_CALC_CONFIG.envio, ...parsed.envio, depositFeePct },
      aduana: { ...DEFAULT_CALC_CONFIG.aduana, ...parsed.aduana },
    };
  } catch {
    return DEFAULT_CALC_CONFIG;
  }
}

export function saveCalcConfig(config: CalcConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CALC_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export interface PricingEstimate {
  precioSugeridoARS: number;
  costoUnitUSD: number;
  costoTotalUSD: number;
  gananciaUnitUSD: number;
  gananciaTotalUSD: number;
  margenPct: number;
  fobRealUSD: number;
  impuestosUSD: number;
  pesoG: number;
}

export function buildProductFromOrder(
  order: CssbuyOrder,
  overrides?: Partial<Pick<Product, "pesoG" | "precioCNY" | "envioLocalCNY" | "envioChinaCNY" | "cantidad" | "markup">>
): Product {
  return {
    id: order.oid || "order",
    nombre: order.producto || "Producto",
    precioCNY: overrides?.precioCNY ?? order.precio_unitario_cny ?? 0,
    envioLocalCNY: overrides?.envioLocalCNY ?? order.envio_local_cny ?? 0,
    envioChinaCNY: overrides?.envioChinaCNY ?? order.envio_china_cny ?? 0,
    pesoG: overrides?.pesoG ?? order.peso_g ?? 0,
    cantidad: overrides?.cantidad ?? order.cantidad ?? 1,
    precioVentaUSD: 0,
    markup: overrides?.markup,
    link: order.url || "",
    imgURL: order.imagen || "",
    oid: order.oid || undefined,
  };
}

export function calculateProductEstimate(
  product: Product,
  config: CalcConfig = DEFAULT_CALC_CONFIG
): PricingEstimate | null {
  if (!product.precioCNY && !product.pesoG) return null;

  const result = calcularTodo([product], config.fx, config.envio, config.aduana);
  if (result.productosCalc.length === 0) return null;

  const p = result.productosCalc[0];
  return {
    precioSugeridoARS: p.ventaUnitARS,
    costoUnitUSD: p.costoUnitUSD,
    costoTotalUSD: p.costoTotalUSD,
    gananciaUnitUSD: p.gananciaUnitUSD,
    gananciaTotalUSD: p.gananciaTotalUSD,
    margenPct: result.margenTotalPct,
    fobRealUSD: result.fobRealUSD,
    impuestosUSD: result.impuestosUSD,
    pesoG: result.pesoTotalG,
  };
}

export function formatARS(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

export function formatUSD(n: number): string {
  return `USD ${n.toFixed(2)}`;
}
