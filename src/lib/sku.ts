import { InventoryItem } from "./types";
import { parseTalle } from "./variantes";

/**
 * Generación de SKU legible: PREFIJO-TALLE-NNN  ->  "AMI-XL-001", "VD-M-002".
 *
 * El SKU se genera con un botón y no se deriva en lectura a propósito: es un
 * identificador que después se pega en una etiqueta, se busca y viaja al CSV de
 * Tiendanube. Si cambiara solo cuando se edita el talle o la marca, dejaría de
 * identificar al producto que ya tenés etiquetado.
 */

/** Saca tildes y deja solo A-Z y 0-9. */
function limpiar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "N")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefijo de la marca.
 *   "Amiri"           -> AMI   (una palabra: 3 primeras letras)
 *   "Miexed Emotions" -> ME    (varias palabras: iniciales)
 *   "Valley Dreams"   -> VD
 */
export function prefijoDeMarca(nombre: string): string {
  const limpio = limpiar(nombre);
  if (!limpio) return "";
  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length === 1) return palabras[0].slice(0, 3);
  return palabras
    .slice(0, 3)
    .map((p) => p[0])
    .join("");
}

/** Sin marca, se usa la primera palabra aprovechable del nombre del producto. */
function prefijoDeNombre(nombre: string): string {
  const limpio = limpiar(nombre);
  const palabras = limpio.split(" ").filter((p) => p.length >= 2);
  // Los títulos en chino quedan vacíos al limpiar: ahí no hay nada que abreviar.
  if (palabras.length === 0) return "ITM";
  return palabras[0].slice(0, 3);
}

export interface SkuOptions {
  /** id de marca -> nombre. */
  nombreDeMarca?: Record<string, string>;
  /** SKUs que ya están en uso y no se pueden repetir. */
  usados?: Set<string>;
}

/** Base del SKU sin el número: "AMI-XL", "SUP", "CRO-L". */
export function baseSku(item: Pick<InventoryItem, "nombre" | "variante" | "marcaId">, opts: SkuOptions = {}): string {
  const { nombreDeMarca = {} } = opts;
  const marca = item.marcaId ? nombreDeMarca[item.marcaId] : "";
  const prefijo = (marca && prefijoDeMarca(marca)) || prefijoDeNombre(item.nombre || "");
  const talle = parseTalle(item.variante);
  return talle ? `${prefijo}-${talle}` : prefijo;
}

/**
 * SKU para un ítem, evitando los ya usados.
 * Muta el set `usados` para que al generar en lote no se pisen entre sí.
 */
export function generarSku(
  item: Pick<InventoryItem, "nombre" | "variante" | "marcaId">,
  opts: SkuOptions = {}
): string {
  const usados = opts.usados ?? new Set<string>();
  const base = baseSku(item, opts);

  for (let n = 1; n < 1000; n++) {
    const candidato = `${base}-${String(n).padStart(3, "0")}`;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }
  // Salida de emergencia: 999 productos con la misma base es improbable, pero
  // devolver algo repetido sería peor que un sufijo feo.
  const fallback = `${base}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  usados.add(fallback);
  return fallback;
}

export interface SkuAsignado {
  id: string;
  sku: string;
}

/**
 * Genera SKUs para varios ítems de una.
 * Por defecto respeta los que ya tienen SKU: no se pisan etiquetas existentes.
 */
export function generarSkusLote(
  items: InventoryItem[],
  opts: SkuOptions & { sobrescribir?: boolean } = {}
): SkuAsignado[] {
  const { sobrescribir = false, nombreDeMarca = {} } = opts;

  // Arranca con todos los SKUs que ya existen, incluidos los de ítems que no
  // se van a tocar, para no generar uno que ya esté en uso.
  const usados = new Set<string>();
  for (const it of items) {
    if (it.sku && (!sobrescribir || false)) usados.add(it.sku);
  }

  const out: SkuAsignado[] = [];
  for (const it of items) {
    if (it.sku && !sobrescribir) continue;
    if (sobrescribir && it.sku) usados.delete(it.sku);
    out.push({ id: it.id, sku: generarSku(it, { nombreDeMarca, usados }) });
  }
  return out;
}
