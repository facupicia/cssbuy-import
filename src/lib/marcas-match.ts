import { InventoryItem, Marca } from "./types";

/**
 * Sugiere qué productos parecen ser de una marca, mirando su nombre.
 *
 * Los títulos que manda CSSBuy traen la marca adentro, a veces deformada para
 * esquivar filtros: "260克】跨境am1ri新款…" es Amiri, "跨境美潮VALE新款…" es
 * Vale. Por eso no alcanza con buscar el nombre literal.
 *
 * Esto solo SUGIERE: la asignación siempre la confirma el usuario. Es una
 * ayuda para la carga inicial, no una fuente de verdad.
 */

/** Sustituciones leet frecuentes en los títulos de 1688 / CSSBuy. */
const LEET: Record<string, string> = {
  a: "a4@",
  e: "e3",
  i: "i1!",
  o: "o0",
  s: "s5$",
  b: "b8",
  g: "g9",
  t: "t7",
};

function escaparRegex(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Arma un patrón donde cada letra acepta sus deformaciones y los espacios son
 * opcionales ("north face" matchea "northface").
 *
 * Se hace por posición y no generando variantes enteras: en los títulos reales
 * suele estar leeteada una sola letra ("am1ri"), no todas.
 */
function patronDe(nombre: string): RegExp | null {
  const base = nombre.trim().toLowerCase();
  if (base.length < 2) return null;

  let patron = "";
  for (const ch of base) {
    if (/\s|[-_.]/.test(ch)) {
      patron += "[\\s\\-_.]*";
    } else if (LEET[ch]) {
      patron += `[${escaparRegex(LEET[ch])}]`;
    } else {
      patron += escaparRegex(ch);
    }
  }
  try {
    return new RegExp(patron, "i");
  } catch {
    return null;
  }
}

/**
 * Una marca corta ("EM") daría falsos positivos dentro de palabras inglesas
 * ("EMbroidered"). Se exige que no esté pegada a otra letra latina; los títulos
 * en chino igual pasan, porque los ideogramas no son letras latinas.
 */
function matchValido(nombre: string, texto: string, indice: number, largo: number): boolean {
  if (nombre.trim().length >= 4) return true;
  const antes = texto[indice - 1];
  const despues = texto[indice + largo];
  const esLetra = (c?: string) => Boolean(c && /[a-z]/i.test(c));
  return !esLetra(antes) && !esLetra(despues);
}

export interface Sugerencia {
  itemId: string;
  nombre: string;
  /** El fragmento que efectivamente matcheó, para poder mostrarlo. */
  coincidencia: string;
}

/**
 * Ítems cuyo nombre contiene la marca (o una deformación reconocible).
 * Por defecto omite los que ya tienen marca, para no pisar decisiones tomadas.
 */
export function sugerirItems(
  marca: Pick<Marca, "nombre">,
  items: InventoryItem[],
  incluirYaAsignados = false
): Sugerencia[] {
  const patron = patronDe(marca.nombre);
  if (!patron) return [];

  const out: Sugerencia[] = [];
  for (const it of items) {
    if (!incluirYaAsignados && it.marcaId) continue;
    const texto = it.nombre || "";
    if (!texto) continue;

    const m = patron.exec(texto);
    if (m && matchValido(marca.nombre, texto, m.index, m[0].length)) {
      out.push({ itemId: it.id, nombre: it.nombre, coincidencia: m[0] });
    }
  }
  return out;
}
