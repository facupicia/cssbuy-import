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
