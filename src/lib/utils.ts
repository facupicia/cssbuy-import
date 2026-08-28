import { FxRates, ShipmentCosts, AduanaConfig, Product, ProductCalc, CalculationResult } from "./types";

export function uid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function fmtUSD(n: number): string {
  return `USD ${Number(n || 0).toFixed(2)}`;
}

export function fmtARS(n: number): string {
  return `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number): string {
  return `${(Number(n || 0) * 100).toFixed(1)}%`;
}

export function emptyResult(): CalculationResult {
  return {
    productosCalc: [],
    productosUSDTotal: 0,
    pesoTotalG: 0,
    costoEnvioTotalUSD: 0,
    fobRealUSD: 0,
    fobDeclaradoUSD: 0,
    ahorroSubdeclaracionUSD: 0,
    fobUSD: 0,
    arancelUSD: 0,
    ivaUSD: 0,
    iibbUSD: 0,
    tasaEstUSD: 0,
    impuestosCalculadosUSD: 0,
    impuestosUSD: 0,
    impuestosARS: 0,
    basePaqueteUSD: 0,
    depositFeeUSD: 0,
    costoPaqueteUSD: 0,
    costoPaqueteARS: 0,
    costoTotalUSD: 0,
    costoTotalARS: 0,
    ingresoTotalUSD: 0,
    ingresoTotalARS: 0,
    gananciaTotalUSD: 0,
    gananciaTotalARS: 0,
    margenTotalPct: 0,
    alertas: [],
  };
}

export function calcularTodo(
  productos: Product[],
  fx: FxRates,
  envio: ShipmentCosts,
  aduana: AduanaConfig
): CalculationResult {
  if (productos.length === 0) {
    return emptyResult();
  }

  const cnyToUsd = fx.cny > 0 ? 1 / fx.cny : 0.1389;
  const blue = fx.blue > 0 ? fx.blue : 1300;
  const alertas: { type: string; msg: string }[] = [];

  // Paso 1: productos base
  const productosBase = productos.map((p) => {
    const cantidad = Math.max(1, Math.floor(Number(p.cantidad) || 1));
    const precioUnitUSD = (p.precioCNY || 0) * cnyToUsd;
    const envioLocalUnitUSD = (p.envioLocalCNY || 0) * cnyToUsd;
    const envioChinaUnitUSD = (p.envioChinaCNY || 0) * cnyToUsd;
    const costoProductoUnitUSD = precioUnitUSD + envioLocalUnitUSD;
    const pesoGTotal = (p.pesoG || 0) * cantidad;
    const costoUSD = costoProductoUnitUSD * cantidad;

    return {
      ...p,
      cantidad,
      precioUnitUSD,
      envioLocalUnitUSD,
      envioChinaUnitUSD,
      costoProductoUnitUSD,
      costoUSD,
      pesoGTotal,
    };
  });

  const productosUSDTotal = productosBase.reduce((s, p) => s + p.costoUSD, 0);
  const pesoTotalG = productosBase.reduce((s, p) => s + p.pesoGTotal, 0);

  // Paso 2: envío
  const freightUSD = envio.freightUSD || 0;
  const costoEnvioTotalUSD = freightUSD;

  // Paso 3: prorratear envío por peso
  const pcWithShipping = productosBase.map((p) => {
    const envioProrrateadoUSD = pesoTotalG > 0 ? (costoEnvioTotalUSD * p.pesoGTotal) / pesoTotalG : 0;
    const costoSinImpuestos = p.costoUSD + envioProrrateadoUSD;
    return { ...p, envioProrrateadoUSD, costoSinImpuestos };
  });

  // Paso 4: FOB / Aduana
  const fobRealUSD = productosUSDTotal + envio.freightUSD;
  const fobDeclaradoUSD = aduana.valorDeclaradoUSD != null ? aduana.valorDeclaradoUSD : fobRealUSD;
  const ahorroSubdeclaracionUSD = fobRealUSD - fobDeclaradoUSD;
  const fobUSD = aduana.dentroFranquicia ? 0 : fobDeclaradoUSD;

  const arancel = fobUSD > 0 ? (fobUSD > 1000 ? fobUSD * 0.35 : 0) : 0;
  const iva = fobUSD > 0 ? (fobUSD + arancel) * (aduana.ivaPct || 0.21) : 0;
  const iibb = fobUSD > 0 ? (fobUSD + arancel + iva) * (aduana.iibbPct || 0.03) : 0;
  const tasaEst = fobUSD > 0 ? fobUSD * 0.02 : 0;
  const impuestosCalculadosUSD = arancel + iva + iibb + tasaEst;

  let impuestosUSD: number;
  if (aduana.pagoNetoImpuestosUSD != null) {
    impuestosUSD = aduana.pagoNetoImpuestosUSD;
  } else if (aduana.dentroFranquicia && aduana.valorDeclaradoUSD != null && aduana.valorDeclaradoUSD > 50) {
    impuestosUSD = (aduana.valorDeclaradoUSD - 50) / 2;
  } else if (aduana.dentroFranquicia) {
    impuestosUSD = 0;
  } else {
    impuestosUSD = impuestosCalculadosUSD;
  }
  const impuestosARS = impuestosUSD * blue;

  // Base del paquete + comisión del depósito CSSBuy (para prorratear en unitario y totales)
  const basePaqueteUSD = productosUSDTotal + costoEnvioTotalUSD;
  const depositFeeUSD = basePaqueteUSD * (envio.depositFeePct || 0);

  // Paso 5: costos totales y precio sugerido
  const productosConCostoTotal = pcWithShipping.map((p) => {
    const impuestosProrrateadoUSD = pesoTotalG > 0 ? (impuestosUSD * p.pesoGTotal) / pesoTotalG : 0;
    const depositoProrrateadoUSD = pesoTotalG > 0 ? (depositFeeUSD * p.pesoGTotal) / pesoTotalG : 0;
    const costoTotalProducto = p.costoSinImpuestos + impuestosProrrateadoUSD + depositoProrrateadoUSD;
    const costoUnitUSD = p.cantidad > 0 ? costoTotalProducto / p.cantidad : 0;
    const markup = typeof p.markup === "number" && p.markup > 0 ? p.markup : (envio.markup || 2);
    const precioSugeridoUSD = costoUnitUSD * markup;
    const precioSugeridoARS = precioSugeridoUSD * blue;

    return {
      ...p,
      markup,
      impuestosProrrateadoUSD,
      depositoProrrateadoUSD,
      costoTotalUSD: costoTotalProducto,
      costoUnitUSD,
      precioSugeridoUSD,
      precioSugeridoARS,
    };
  });

  const costoPaqueteUSD = basePaqueteUSD + depositFeeUSD;
  const costoPaqueteARS = costoPaqueteUSD * blue;
  const costoTotalUSD = costoPaqueteUSD + impuestosUSD;
  const costoTotalARS = costoTotalUSD * blue;

  // Paso 6: ganancias y totales
  const productosFinal: ProductCalc[] = productosConCostoTotal.map((p) => {
    const precioVentaUnitUSD = p.precioVentaUSD > 0 ? p.precioVentaUSD : p.precioSugeridoUSD;
    const ventaUSD = precioVentaUnitUSD * p.cantidad;
    const gananciaTotalUSD = ventaUSD - p.costoTotalUSD;
    const gananciaUnitUSD = p.cantidad > 0 ? gananciaTotalUSD / p.cantidad : 0;

    return {
      ...p,
      ventaUSD,
      gananciaUnitUSD,
      gananciaTotalUSD,
      costoUnitARS: p.costoUnitUSD * blue,
      ventaUnitARS: precioVentaUnitUSD * blue,
      gananciaUnitARS: gananciaUnitUSD * blue,
      gananciaTotalARS: gananciaTotalUSD * blue,
    };
  });

  const ingresoTotalUSD = productosFinal.reduce((s, p) => s + p.ventaUSD, 0);
  const ingresoTotalARS = ingresoTotalUSD * blue;
  const gananciaTotalUSD = ingresoTotalUSD - costoTotalUSD;
  const gananciaTotalARS = gananciaTotalUSD * blue;
  const margenTotalPct = costoTotalUSD > 0 ? gananciaTotalUSD / costoTotalUSD : 0;

  // Alertas
  if (aduana.enviosAnio > 3) alertas.push({ type: "warning", msg: "Ya superaste 3 envíos este año" });
  if (ahorroSubdeclaracionUSD > 200) alertas.push({ type: "warning", msg: "Ahorro por subdeclaración > USD 200" });
  if (productos.length > 3) alertas.push({ type: "info", msg: `${productos.length} productos en el paquete` });
  if (productosUSDTotal === 0) alertas.push({ type: "warning", msg: "Falta configurar el valor CNY a USD" });

  return {
    productosCalc: productosFinal,
    productosUSDTotal,
    pesoTotalG,
    costoEnvioTotalUSD,
    fobRealUSD,
    fobDeclaradoUSD,
    ahorroSubdeclaracionUSD,
    fobUSD,
    arancelUSD: arancel,
    ivaUSD: iva,
    iibbUSD: iibb,
    tasaEstUSD: tasaEst,
    impuestosCalculadosUSD,
    impuestosUSD,
    impuestosARS,
    basePaqueteUSD,
    depositFeeUSD,
    costoPaqueteUSD,
    costoPaqueteARS,
    costoTotalUSD,
    costoTotalARS,
    ingresoTotalUSD,
    ingresoTotalARS,
    gananciaTotalUSD,
    gananciaTotalARS,
    margenTotalPct,
    alertas,
  };
}
