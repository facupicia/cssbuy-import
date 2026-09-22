/**
 * Lectura del talle y el color desde el campo libre `variante`.
 *
 * CSSBuy manda la variante como pares "clave:valor" separados por ";", pero la
 * clave del talle cambia según el vendedor: en los datos reales aparece como
 * Size, Talla, Tamaño y 尺码. Lo mismo con el color: Color, Colores y 颜色.
 *
 * El talle se deriva en lectura en vez de guardarse en su propia columna: la
 * variante es la fuente, así que si se edita, el talle acompaña sin migración
 * ni backfill que se pueda desincronizar.
 */

const CLAVES_TALLE = ["size", "talla", "talle", "tamaño", "tamano", "尺码", "尺寸"];
const CLAVES_COLOR = ["color", "colores", "colour", "颜色"];

/** Talles conocidos, en orden de menor a mayor para poder ordenarlos. */
const ORDEN_TALLE = [
  "XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL",
];

/** "2XL" y "XXL" son lo mismo; se unifica a la forma con X repetidas. */
export function canonizar(valor: string): string {
  const v = valor.trim().toUpperCase().replace(/\s+/g, "");
  const m = v.match(/^([2-6])X{1,2}L$/);
  if (m) return "X".repeat(Number(m[1])) + "L";
  const ms = v.match(/^([2-6])X{1,2}S$/);
  if (ms) return "X".repeat(Number(ms[1])) + "S";
  return v;
}

function pares(variante: string): { clave: string; valor: string }[] {
  return variante
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(":");
      if (i <= 0) return null;
      return { clave: p.slice(0, i).trim().toLowerCase(), valor: p.slice(i + 1).trim() };
    })
    .filter((x): x is { clave: string; valor: string } => Boolean(x && x.valor));
}

/**
 * Talle del ítem, o null si no se puede determinar.
 * Si no hay pares clave:valor, busca un talle suelto en el texto ("negro / L").
 */
export function parseTalle(variante?: string | null): string | null {
  const texto = (variante || "").trim();
  if (!texto) return null;

  for (const { clave, valor } of pares(texto)) {
    if (CLAVES_TALLE.includes(clave)) return canonizar(valor);
  }

  // Texto libre: un token que sea un talle conocido o un número de calzado.
  const tokens = texto.split(/[/,·|\s]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (esTalle(t)) return canonizar(t);
  }
  return null;
}

/** Un talle conocido o un número de calzado (38, 40.5). */
function esTalle(token: string): boolean {
  const c = canonizar(token);
  return ORDEN_TALLE.includes(c) || /^\d{2}(\.5)?$/.test(c);
}

/**
 * La variante sin el talle: en los ítems con varios talles, el talle va en su
 * propia lista y la variante queda para el color o el detalle.
 *   "Color:Negro;Size:L" -> "Negro"      "negro / L" -> "negro"
 */
export function varianteSinTalle(variante?: string | null): string | null {
  const texto = (variante || "").trim();
  if (!texto) return null;

  const ps = pares(texto);
  if (ps.length > 0) {
    const resto = ps.filter((p) => !CLAVES_TALLE.includes(p.clave)).map((p) => p.valor);
    return resto.length > 0 ? resto.join(" · ") : null;
  }

  const resto = texto
    .split(/[/,·|]/)
    .map((parte) => parte.trim().split(/\s+/).filter((t) => t && !esTalle(t)).join(" "))
    .filter(Boolean);
  return resto.length > 0 ? resto.join(" / ") : null;
}

/** Color del ítem, o null. */
export function parseColor(variante?: string | null): string | null {
  const texto = (variante || "").trim();
  if (!texto) return null;
  for (const { clave, valor } of pares(texto)) {
    if (CLAVES_COLOR.includes(clave)) return valor;
  }
  return null;
}

/** Ordena talles de menor a mayor; los desconocidos van al final, alfabéticos. */
export function compararTalles(bruto1: string, bruto2: string): number {
  // Se canoniza acá también para que ordenar sea correcto aunque el llamador
  // pase valores crudos ("3XL" y "XXXL" son el mismo talle).
  const a = canonizar(bruto1);
  const b = canonizar(bruto2);
  const ia = ORDEN_TALLE.indexOf(a);
  const ib = ORDEN_TALLE.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;

  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;

  return a.localeCompare(b, "es");
}

/**
 * Talles presentes en el inventario, únicos y ordenados: los de la lista de
 * talles si el ítem la tiene, o el de la variante si no.
 */
export function tallesDeItems(
  items: { variante?: string | null; talles?: { talle: string }[] | null }[]
): string[] {
  const set = new Set<string>();
  for (const it of items) {
    if (Array.isArray(it.talles) && it.talles.length > 0) {
      for (const t of it.talles) {
        if (t.talle) set.add(canonizar(t.talle));
      }
    } else {
      const t = parseTalle(it.variante);
      if (t) set.add(t);
    }
  }
  return [...set].sort(compararTalles);
}

/** Verifica si un ítem posee un talle específico (por talles estructurados o variante). */
export function itemTieneTalle(
  item: { variante?: string | null; talles?: { talle: string }[] | null },
  talleBuscado: string
): boolean {
  const buscado = canonizar(talleBuscado);
  if (Array.isArray(item.talles) && item.talles.length > 0) {
    return item.talles.some((t) => canonizar(t.talle) === buscado);
  }
  return parseTalle(item.variante) === buscado;
}
