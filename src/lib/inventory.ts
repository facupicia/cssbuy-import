import {
  InventoryItem,
  InventoryItemCalc,
  InventorySummary,
  InventoryEstado,
} from "./types";

/**
 * Deriva los números de un ítem de inventario (stock, capital inmovilizado,
 * ganancia realizada y potencial). Función pura: sirve en cliente y servidor.
 */
export function calcInventoryItem(it: InventoryItem): InventoryItemCalc {
  const cantidadInicial = Math.max(0, Number(it.cantidadInicial) || 0);
  const cantidadVendida = Math.min(
    cantidadInicial,
    Math.max(0, Number(it.cantidadVendida) || 0)
  );
  const stock = cantidadInicial - cantidadVendida;

  const costoUnitUSD = Number(it.costoUnitUSD) || 0;
  const costoUnitARS = Number(it.costoUnitARS) || 0;
  const precioVentaARS = Number(it.precioVentaARS) || 0;

  const gananciaUnitARS = precioVentaARS - costoUnitARS;

  return {
    ...it,
    cantidadInicial,
    cantidadVendida,
    costoUnitUSD,
    costoUnitARS,
    precioVentaARS,
    stock,
    invertidoARS: costoUnitARS * cantidadInicial,
    capitalStockARS: costoUnitARS * stock,
    gananciaRealizadaARS: gananciaUnitARS * cantidadVendida,
    gananciaPotencialARS: gananciaUnitARS * stock,
    ingresoRealizadoARS: precioVentaARS * cantidadVendida,
    margenUnitPct: precioVentaARS > 0 ? gananciaUnitARS / precioVentaARS : 0,
  };
}

/** Estado sugerido a partir del stock, cuando el usuario no lo fija a mano. */
export function suggestEstado(
  cantidadInicial: number,
  cantidadVendida: number
): InventoryEstado {
  if (cantidadInicial > 0 && cantidadVendida >= cantidadInicial) return "agotado";
  return "en_deposito";
}

export function summarizeInventory(items: InventoryItem[]): InventorySummary {
  const calc = items.map(calcInventoryItem);
  const sum = (fn: (c: InventoryItemCalc) => number) =>
    calc.reduce((acc, c) => acc + fn(c), 0);

  return {
    totalItems: items.length,
    unidadesStock: sum((c) => c.stock),
    unidadesVendidas: sum((c) => c.cantidadVendida),
    capitalStockARS: sum((c) => c.capitalStockARS),
    invertidoTotalARS: sum((c) => c.invertidoARS),
    gananciaRealizadaARS: sum((c) => c.gananciaRealizadaARS),
    gananciaPotencialARS: sum((c) => c.gananciaPotencialARS),
    ingresoRealizadoARS: sum((c) => c.ingresoRealizadoARS),
  };
}

export const ESTADO_LABEL: Record<InventoryEstado, string> = {
  en_transito: "En tránsito",
  en_deposito: "En depósito",
  agotado: "Agotado",
};

export type InventoryInput = Partial<Omit<InventoryItem, "id" | "createdAt" | "updatedAt">>;

const ESTADOS: InventoryEstado[] = ["en_transito", "en_deposito", "agotado"];
const ORIGENES = ["manual", "cssbuy", "cotizacion"] as const;

/** Deja solo las claves conocidas del modelo y castea números/strings. */
export function sanitizeInventoryInput(body: Record<string, unknown>): InventoryInput {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const str = (v: unknown) =>
    v === null || v === undefined || v === "" ? null : String(v);

  const out: InventoryInput = {};
  if ("nombre" in body) out.nombre = String(body.nombre ?? "").trim();
  if ("sku" in body) out.sku = str(body.sku);
  if ("variante" in body) out.variante = str(body.variante);
  if ("imagen" in body) out.imagen = str(body.imagen);
  if ("link" in body) out.link = str(body.link);
  if ("cantidadInicial" in body) out.cantidadInicial = num(body.cantidadInicial);
  if ("cantidadVendida" in body) out.cantidadVendida = num(body.cantidadVendida);
  if ("costoUnitUSD" in body) out.costoUnitUSD = num(body.costoUnitUSD);
  if ("costoUnitARS" in body) out.costoUnitARS = num(body.costoUnitARS);
  if ("precioVentaARS" in body) out.precioVentaARS = num(body.precioVentaARS);
  if ("estado" in body && ESTADOS.includes(body.estado as InventoryEstado)) {
    out.estado = body.estado as InventoryEstado;
  }
  if ("ubicacion" in body) out.ubicacion = str(body.ubicacion);
  if ("notas" in body) out.notas = str(body.notas);
  if ("origen" in body && ORIGENES.includes(body.origen as (typeof ORIGENES)[number])) {
    out.origen = body.origen as InventoryInput["origen"];
  }
  if ("origenRef" in body) out.origenRef = str(body.origenRef);
  return out;
}

/**
 * Operación de precio en lote. Se resuelve por ítem porque `markup` depende
 * del costo de cada fila.
 *   - porcentaje: sube o baja el precio actual un %  (ej. +10, -15)
 *   - markup:     precio = costo unitario * factor   (ej. 2.5)
 *   - fijo:       mismo precio para todos
 */
export type BulkPriceOp =
  | { modo: "porcentaje"; valor: number }
  | { modo: "markup"; valor: number }
  | { modo: "fijo"; valor: number };

export const BULK_PRICE_MODOS = ["porcentaje", "markup", "fijo"] as const;

export function isBulkPriceOp(v: unknown): v is BulkPriceOp {
  if (!v || typeof v !== "object") return false;
  const o = v as { modo?: unknown; valor?: unknown };
  return (
    typeof o.modo === "string" &&
    (BULK_PRICE_MODOS as readonly string[]).includes(o.modo) &&
    typeof o.valor === "number" &&
    Number.isFinite(o.valor)
  );
}

/** Umbral por defecto para avisar que a un ítem le queda poco stock. */
export const STOCK_BAJO_DEFAULT = 2;
