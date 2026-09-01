export interface FxRates {
  blue: number;
  oficial: number;
  mep: number;
  cny: number;
}

export interface ShipmentCosts {
  freightUSD: number;
  depositFeePct: number;
  markup: number;
}

export interface AduanaConfig {
  dentroFranquicia: boolean;
  enviosAnio: number;
  ivaPct: number;
  iibbPct: number;
  valorDeclaradoUSD: number | null;
  pagoNetoImpuestosUSD: number | null;
}

export interface Product {
  id: string;
  nombre: string;
  precioCNY: number;
  envioLocalCNY: number;
  envioChinaCNY: number;
  pesoG: number;
  cantidad: number;
  precioVentaUSD: number;
  /** Precio de venta unitario fijado a mano en ARS. Tiene prioridad sobre markup y precioVentaUSD. */
  precioVentaARS?: number;
  markup?: number;
  link?: string;
  imgURL?: string;
  oid?: string;
  fotos_qc?: string[];
  foto_peso?: string;
}

export interface ProductCalc extends Product {
  precioUnitUSD: number;
  envioLocalUnitUSD: number;
  envioChinaUnitUSD: number;
  costoProductoUnitUSD: number;
  costoUSD: number;
  pesoGTotal: number;
  envioProrrateadoUSD: number;
  costoSinImpuestos: number;
  impuestosProrrateadoUSD: number;
  depositoProrrateadoUSD: number;
  costoTotalUSD: number;
  costoUnitUSD: number;
  markup: number;
  precioSugeridoUSD: number;
  precioSugeridoARS: number;
  /** Markup realmente aplicado segun el precio de venta final (venta / costo). */
  markupEfectivo: number;
  /** Margen sobre el precio de venta: (venta - costo) / venta. */
  margenUnitPct: number;
  ventaUSD: number;
  gananciaUnitUSD: number;
  gananciaTotalUSD: number;
  costoUnitARS: number;
  ventaUnitARS: number;
  gananciaUnitARS: number;
  gananciaTotalARS: number;
}

export interface CalculationResult {
  productosCalc: ProductCalc[];
  productosUSDTotal: number;
  pesoTotalG: number;
  costoEnvioTotalUSD: number;
  fobRealUSD: number;
  fobDeclaradoUSD: number;
  ahorroSubdeclaracionUSD: number;
  fobUSD: number;
  arancelUSD: number;
  ivaUSD: number;
  iibbUSD: number;
  tasaEstUSD: number;
  impuestosCalculadosUSD: number;
  impuestosUSD: number;
  impuestosARS: number;
  basePaqueteUSD: number;
  depositFeeUSD: number;
  costoPaqueteUSD: number;
  costoPaqueteARS: number;
  costoTotalUSD: number;
  costoTotalARS: number;
  ingresoTotalUSD: number;
  ingresoTotalARS: number;
  gananciaTotalUSD: number;
  gananciaTotalARS: number;
  margenTotalPct: number;
  alertas: { type: string; msg: string }[];
}

export interface Cotizacion {
  id: string;
  fecha: string;
  nombre: string;
  fx: FxRates;
  envio: ShipmentCosts;
  aduana: AduanaConfig;
  productos: Product[];
  resultados: CalculationResult;
}

export interface ShopCotizacion {
  id: string;
  created_at: string;
  nombre: string;
  fx: FxRates;
  envio: ShipmentCosts;
  aduana: AduanaConfig;
  productos: Product[];
  resultados: CalculationResult;
}

export interface CssbuyOrder {
  oid: string;
  producto: string;
  imagen: string;
  url: string;
  vendedor: string;
  variante: string;
  precio_unitario_cny: number;
  envio_local_cny: number;
  envio_china_cny: number;
  cantidad: number;
  estado: string;
  peso_g: number;
  tracking: string;
  fecha_pedido: number;
  fotos_qc?: string[];
  foto_peso?: string;
}

export interface CssbuyTransaction {
  id?: string;
  orderId?: string;
  productName?: string;
  productUrl?: string;
  quantity?: number;
  seller?: string;
  money: string | number;
  action: string;
  remark: string;
  addtime?: string | number;
  [key: string]: any;
}

export interface CssbuyRecordGroup {
  orderId: string;
  transactions: CssbuyTransaction[];
  buyItemTotal: number;
  serviceFeeTotal: number;
  domesticShippingTotal: number;
  adjustPriceTotal: number;
  rechargeTotal: number;
  otherTotal: number;
  totalSpent: number;
  productName?: string;
  productUrl?: string;
  quantity?: number;
}

export interface RecordSummary {
  totalRecords: number;
  totalRecharged: number;
  totalSpent: number;
  groupCount: number;
  unlinkedCount: number;
}

/* ── Inventario ──────────────────────────────────────────────────────── */

export type InventoryEstado = "en_transito" | "en_deposito" | "agotado";
export type InventoryOrigen = "manual" | "cssbuy" | "cotizacion";

export interface InventoryItem {
  id: string;
  nombre: string;
  sku?: string | null;
  variante?: string | null;
  imagen?: string | null;
  link?: string | null;
  /** Unidades recibidas / compradas para este ítem. */
  cantidadInicial: number;
  /** Unidades ya vendidas. Nunca mayor que cantidadInicial. */
  cantidadVendida: number;
  /** Costo landed unitario en USD (referencia). */
  costoUnitUSD: number;
  /** Costo landed unitario en ARS: base para la ganancia. */
  costoUnitARS: number;
  /** Precio de venta unitario en ARS. */
  precioVentaARS: number;
  estado: InventoryEstado;
  ubicacion?: string | null;
  notas?: string | null;
  origen: InventoryOrigen;
  /** oid de la orden CSSBuy o id de la cotización que originó el ítem. */
  origenRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemCalc extends InventoryItem {
  /** cantidadInicial - cantidadVendida. */
  stock: number;
  /** Capital total puesto en el ítem (costo * cantidadInicial), en ARS. */
  invertidoARS: number;
  /** Capital todavía inmovilizado en el stock sin vender, en ARS. */
  capitalStockARS: number;
  /** Ganancia ya embolsada por las unidades vendidas, en ARS. */
  gananciaRealizadaARS: number;
  /** Ganancia que falta realizar si se vende todo el stock restante, en ARS. */
  gananciaPotencialARS: number;
  /** Ingreso ya facturado por las unidades vendidas, en ARS. */
  ingresoRealizadoARS: number;
  /** Margen unitario sobre el precio de venta: (venta - costo) / venta. */
  margenUnitPct: number;
}

export interface InventorySummary {
  totalItems: number;
  unidadesStock: number;
  unidadesVendidas: number;
  capitalStockARS: number;
  invertidoTotalARS: number;
  gananciaRealizadaARS: number;
  gananciaPotencialARS: number;
  ingresoRealizadoARS: number;
}
