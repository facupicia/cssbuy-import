import { InventoryItem, Cotizacion } from "./types";

/**
 * Trae a un ítem de inventario los números que ya decidiste en la cotización.
 *
 * El vínculo es el `oid` de CSSBuy: el inventario lo guarda en `origenRef` y
 * los productos de la cotización lo llevan en `oid`. No hace falta ninguna
 * tabla intermedia.
 *
 * Se sincroniza el precio Y el costo. El costo importa tanto como el precio:
 * la importación desde CSSBuy solo conoce lo que salió el producto, mientras
 * que la cotización prorratea el flete internacional, los impuestos y la
 * comisión del depósito. Copiar solo el precio dejaría márgenes inflados.
 */

export interface PriceDiff {
  id: string;
  nombre: string;
  oid: string;
  cotizacionId: string;
  cotizacionNombre: string;
  precioAntes: number;
  precioDespues: number;
  costoAntes: number;
  costoDespues: number;
  costoUSDDespues: number;
  /** true si algún número cambia de verdad. */
  cambia: boolean;
}

export interface SyncPlan {
  diffs: PriceDiff[];
  /** Ítems sin oid o sin producto equivalente en ninguna cotización. */
  sinMatch: { id: string; nombre: string; motivo: string }[];
}

interface ProductoCotizado {
  oid: string;
  precioARS: number;
  costoARS: number;
  costoUSD: number;
  cotizacionId: string;
  cotizacionNombre: string;
}

/**
 * Arma el índice oid -> producto cotizado. Si un oid aparece en varias
 * cotizaciones gana la más reciente, que es la decisión vigente.
 */
export function indexarCotizaciones(cotizaciones: Cotizacion[]): Map<string, ProductoCotizado> {
  const porFecha = [...cotizaciones].sort(
    (a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()
  );

  const idx = new Map<string, ProductoCotizado>();

  for (const cot of porFecha) {
    const calcs = cot.resultados?.productosCalc ?? [];
    for (const pc of calcs) {
      const oid = pc.oid;
      if (!oid) continue;
      if (idx.has(oid)) continue; // ya lo tomó una cotización más nueva

      // ventaUnitARS ya resuelve la precedencia precio manual > sugerido.
      const precioARS = Number(pc.ventaUnitARS) || 0;
      const costoARS = Number(pc.costoUnitARS) || 0;
      if (precioARS <= 0 && costoARS <= 0) continue;

      idx.set(oid, {
        oid,
        precioARS,
        costoARS,
        costoUSD: Number(pc.costoUnitUSD) || 0,
        cotizacionId: cot.id,
        cotizacionNombre: cot.nombre || "Sin nombre",
      });
    }
  }

  return idx;
}

/** Redondeo a peso entero, igual que hace el resto de la app. */
const r = (n: number) => Math.round(n);

export function planificarSync(
  items: InventoryItem[],
  cotizaciones: Cotizacion[]
): SyncPlan {
  const idx = indexarCotizaciones(cotizaciones);
  const diffs: PriceDiff[] = [];
  const sinMatch: SyncPlan["sinMatch"] = [];

  for (const it of items) {
    const oid = (it.origenRef || "").trim();
    if (!oid) {
      sinMatch.push({ id: it.id, nombre: it.nombre, motivo: "sin oid de CSSBuy" });
      continue;
    }

    const cotizado = idx.get(oid);
    if (!cotizado) {
      sinMatch.push({ id: it.id, nombre: it.nombre, motivo: "no está en ninguna cotización" });
      continue;
    }

    const precioDespues = r(cotizado.precioARS);
    const costoDespues = r(cotizado.costoARS);
    const cambia =
      (precioDespues > 0 && precioDespues !== r(it.precioVentaARS)) ||
      (costoDespues > 0 && costoDespues !== r(it.costoUnitARS));

    diffs.push({
      id: it.id,
      nombre: it.nombre,
      oid,
      cotizacionId: cotizado.cotizacionId,
      cotizacionNombre: cotizado.cotizacionNombre,
      precioAntes: r(it.precioVentaARS),
      precioDespues,
      costoAntes: r(it.costoUnitARS),
      costoDespues,
      costoUSDDespues: cotizado.costoUSD,
      cambia,
    });
  }

  return { diffs, sinMatch };
}

/** Solo lo que efectivamente cambia, listo para mandar al endpoint. */
export function cambiosAAplicar(plan: SyncPlan) {
  return plan.diffs
    .filter((d) => d.cambia)
    .map((d) => ({
      id: d.id,
      precioVentaARS: d.precioDespues,
      costoUnitARS: d.costoDespues,
      costoUnitUSD: d.costoUSDDespues,
    }));
}
