/**
 * Normalización del color que mandan los vendedores de CSSBuy.
 *
 * El mismo color llega de mil formas: "194 negro", "578 black", "581黑",
 * "715 黑色", "Blanco (Buena calidad)", "EM102黑（白膜直喷". Adelante suele ir
 * el código del modelo del vendedor y el color puede estar en español, inglés
 * o chino. Para la tienda se quiere un nombre en español y siempre el mismo.
 */

/**
 * Términos de color -> nombre en español. Van sin tildes y en minúsculas,
 * que es como queda el texto después de normalizarlo. Los compuestos van
 * antes que sus partes ("azul marino" antes que "azul") porque la regex prueba
 * las alternativas en orden.
 */
const TERMINOS: [string, string][] = [
  // Compuestos
  ["azul marino", "Azul marino"],
  ["navy blue", "Azul marino"],
  ["navy", "Azul marino"],
  ["royal blue", "Azul"],
  ["sky blue", "Celeste"],
  ["light blue", "Celeste"],
  ["baby blue", "Celeste"],
  ["verde militar", "Verde militar"],
  ["army green", "Verde militar"],
  ["off white", "Blanco"],
  ["藏青", "Azul marino"],
  ["藏蓝", "Azul marino"],
  ["天蓝", "Celeste"],
  ["浅蓝", "Celeste"],
  ["酒红", "Bordó"],
  ["军绿", "Verde militar"],
  ["卡其", "Caqui"],
  ["咖啡", "Marrón"],
  ["米白", "Crema"],
  ["米色", "Beige"],
  // Español
  ["negro", "Negro"],
  ["negra", "Negro"],
  ["blanco", "Blanco"],
  ["blanca", "Blanco"],
  ["gris", "Gris"],
  ["rojo", "Rojo"],
  ["roja", "Rojo"],
  ["azul", "Azul"],
  ["celeste", "Celeste"],
  ["verde", "Verde"],
  ["amarillo", "Amarillo"],
  ["amarilla", "Amarillo"],
  ["naranja", "Naranja"],
  ["rosado", "Rosa"],
  ["rosada", "Rosa"],
  ["rosa", "Rosa"],
  ["violeta", "Violeta"],
  ["morado", "Violeta"],
  ["morada", "Violeta"],
  ["lila", "Lila"],
  ["marron", "Marrón"],
  ["cafe", "Marrón"],
  ["beige", "Beige"],
  ["crema", "Crema"],
  ["bordo", "Bordó"],
  ["dorado", "Dorado"],
  ["dorada", "Dorado"],
  ["plateado", "Plateado"],
  ["plateada", "Plateado"],
  ["caqui", "Caqui"],
  // Inglés
  ["black", "Negro"],
  ["white", "Blanco"],
  ["grey", "Gris"],
  ["gray", "Gris"],
  ["red", "Rojo"],
  ["blue", "Azul"],
  ["green", "Verde"],
  ["yellow", "Amarillo"],
  ["orange", "Naranja"],
  ["pink", "Rosa"],
  ["purple", "Violeta"],
  ["brown", "Marrón"],
  ["cream", "Crema"],
  ["khaki", "Caqui"],
  ["gold", "Dorado"],
  ["silver", "Plateado"],
  // Chino (un carácter; 黑色 y 黑 dan lo mismo)
  ["黑", "Negro"],
  ["白", "Blanco"],
  ["灰", "Gris"],
  ["红", "Rojo"],
  ["蓝", "Azul"],
  ["绿", "Verde"],
  ["黄", "Amarillo"],
  ["橙", "Naranja"],
  ["粉", "Rosa"],
  ["紫", "Violeta"],
  ["棕", "Marrón"],
  ["咖", "Marrón"],
  ["杏", "Beige"],
];

const NOMBRE = new Map(TERMINOS);

// Las palabras latinas van con bordes para que "red" no matchee en "tired";
// el chino no tiene espacios, así que va sin bordes.
const PATRON = new RegExp(
  TERMINOS.map(([t]) => (/^[a-z ]+$/.test(t) ? `(?<![a-z])${t}(?![a-z])` : t)).join("|"),
  "g"
);

/** Código del vendedor al principio ("S285", "EM102", "0079"): se descarta. */
const CODIGO = /^\s*([A-Za-z]{0,3}\d{2,5}[A-Za-z]?)(?=[\s\u3400-\u9fff（(]|$)/;

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Color en español, o null si no se reconoce ninguno.
 *   "194 negro" -> "Negro"          "S285 white" -> "Blanco"
 *   "0079白" -> "Blanco"            "150 marrón blanco" -> "Marrón y Blanco"
 *   "EM102黑（白膜直喷" -> "Negro"   (lo de entre paréntesis es el estampado)
 */
export function normalizarColor(valor?: string | null): string | null {
  let texto = (valor || "").replace(CODIGO, " ");
  // Lo que va entre paréntesis ("Buena calidad", "白膜直喷" = estampado
  // blanco) o después de un + ("烫钻" = strass) describe el estampado o la
  // calidad, no el color de la prenda. El paréntesis puede no cerrar.
  texto = texto
    .replace(/[（(【\[][^）)】\]]*([）)】\]]|$)/g, " ")
    .replace(/\+.*$/, " ");

  const vistos: string[] = [];
  for (const m of sinTildes(texto).matchAll(PATRON)) {
    const nombre = NOMBRE.get(m[0]);
    if (nombre && !vistos.includes(nombre)) vistos.push(nombre);
  }
  if (vistos.length === 0) return null;
  // Más de dos colores ya es un estampado: con los dos primeros alcanza.
  return vistos.slice(0, 2).join(" y ");
}
