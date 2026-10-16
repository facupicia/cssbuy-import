/**
 * Tablas de talle por marca, tomadas de las fichas del proveedor.
 *
 * NO hay una tabla genérica a propósito. Comparando las fichas, el largo casi
 * coincide (1-2 cm de diferencia) pero el PECHO se dispersa 16 cm entre marcas,
 * y el escalón entre talles dentro de una misma marca es de solo 4-6 cm: la
 * diferencia entre marcas equivale a 3 o 4 talles. El caso que lo cierra es que
 * un Valley S (116 cm de pecho) es más ancho que un Corteiz XL (112 cm).
 * Unificarlas generaría cambios y devoluciones.
 *
 * Todas las medidas están en centímetros, con la prenda apoyada y estirada.
 */

export type ClaveMedida = "largo" | "pecho" | "hombro" | "manga" | "ruedo";

export const ETIQUETA_MEDIDA: Record<ClaveMedida, string> = {
  largo: "Largo",
  pecho: "Pecho",
  hombro: "Hombros",
  manga: "Manga",
  ruedo: "Ancho del ruedo",
};

export interface FilaTalle {
  talle: string;
  largo?: number;
  pecho?: number;
  hombro?: number;
  manga?: number;
  ruedo?: number;
  /** Altura sugerida en cm, cuando la ficha la trae. */
  alturaCm?: string;
  /** Peso sugerido en kg. Las fichas en 斤 (jin) se convierten: 1 jin = 0,5 kg. */
  pesoKg?: string;
}

export interface TablaTalle {
  /** Nombre de marca tal como se carga en el inventario. */
  marca: string;
  /** Aclaración propia de la ficha, si la tiene. */
  nota?: string;
  filas: FilaTalle[];
}

export const TABLAS_TALLE: TablaTalle[] = [
  {
    marca: "Sp5der",
    nota: "Tabla del proveedor para buzos Sp5der. Pecho expresado como contorno completo; el ruedo se mide de lado a lado, con la prenda apoyada.",
    filas: [
      { talle: "S", pecho: 114, largo: 66, manga: 59, hombro: 56, ruedo: 45 },
      { talle: "M", pecho: 120, largo: 68, manga: 61, hombro: 58, ruedo: 47 },
      { talle: "L", pecho: 126, largo: 70, manga: 63, hombro: 60, ruedo: 49 },
      { talle: "XL", pecho: 132, largo: 72, manga: 65, hombro: 62, ruedo: 51 },
    ],
  },
  {
    marca: "Bape",
    nota: "Tabla del proveedor para remeras Bape. Pecho expresado como contorno: se duplicó el ancho de la ficha original (axila a axila). El talle XXL corresponde al 2XL del proveedor. La altura y el peso son orientativos; el calce depende de cada persona.",
    filas: [
      { talle: "S", hombro: 47, pecho: 100, largo: 68, manga: 20, alturaCm: "165 a 170", pesoKg: "50 a 60" },
      { talle: "M", hombro: 50, pecho: 106, largo: 71, manga: 21, alturaCm: "170 a 175", pesoKg: "60 a 70" },
      { talle: "L", hombro: 53, pecho: 112, largo: 74, manga: 22, alturaCm: "175 a 180", pesoKg: "70 a 80" },
      { talle: "XL", hombro: 56, pecho: 118, largo: 77, manga: 23, alturaCm: "180 a 185", pesoKg: "80 a 90" },
      { talle: "XXL", hombro: 59, pecho: 124, largo: 80, manga: 24, alturaCm: "185 a 190", pesoKg: "90 a 100" },
    ],
  },
  {
    marca: "Supreme",
    nota: "La ficha original da el peso en 斤 (jin). Está convertido a kilos: 1 jin = 0,5 kg.",
    filas: [
      { talle: "S", largo: 70, pecho: 100, manga: 20, alturaCm: "170", pesoKg: "60 a 70" },
      { talle: "M", largo: 73, pecho: 106, manga: 20, alturaCm: "175", pesoKg: "70 a 80" },
      { talle: "L", largo: 75, pecho: 112, manga: 20, alturaCm: "180", pesoKg: "80 a 90" },
      { talle: "XL", largo: 77, pecho: 118, manga: 21, alturaCm: "185", pesoKg: "90 a 100" },
      { talle: "XXL", largo: 79, pecho: 126, manga: 21, alturaCm: "185", pesoKg: "100 a 105" },
    ],
  },
  {
    marca: "Valley Dreams",
    filas: [
      { talle: "S", hombro: 56, pecho: 116, largo: 72, manga: 22 },
      { talle: "M", hombro: 58, pecho: 120, largo: 74, manga: 23 },
      { talle: "L", hombro: 60, pecho: 124, largo: 76, manga: 24 },
      { talle: "XL", hombro: 62, pecho: 128, largo: 78, manga: 25 },
    ],
  },
  {
    marca: "Miexed Emotions",
    nota: "El proveedor aclara una tolerancia de 1 a 3 cm según el método de medición.",
    filas: [
      { talle: "S", largo: 71, pecho: 112, hombro: 54, manga: 22 },
      { talle: "M", largo: 73, pecho: 116, hombro: 56, manga: 23 },
      { talle: "L", largo: 75, pecho: 120, hombro: 58, manga: 24 },
      { talle: "XL", largo: 77, pecho: 124, hombro: 60, manga: 25 },
    ],
  },
  {
    marca: "Corteiz",
    nota: "Referencia del proveedor: 1,72 m y 50 kg usa S · 1,78 m y 65 kg usa L · 1,82 m y 70 kg usa XL.",
    filas: [
      { talle: "S", largo: 72, pecho: 100, hombro: 46, manga: 19 },
      { talle: "M", largo: 74, pecho: 104, hombro: 48, manga: 20 },
      { talle: "L", largo: 76, pecho: 108, hombro: 50, manga: 21 },
      { talle: "XL", largo: 78, pecho: 112, hombro: 52, manga: 22 },
    ],
  },
];

// El dueño confirmó que las remeras Amiri usan las medidas de Supreme.
TABLAS_TALLE.push({
  marca: "Amiri",
  nota: "Pecho expresado como contorno completo. La altura y el peso son orientativos; el calce depende de cada persona.",
  filas: TABLAS_TALLE.find(t => t.marca === "Supreme")!.filas.map(f => ({ ...f })),
});

/** Busca la tabla de una marca sin distinguir mayúsculas ni tildes. */
export function tablaDeMarca(marca?: string | null): TablaTalle | null {
  const q = (marca || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!q) return null;
  return (
    TABLAS_TALLE.find(
      (t) =>
        t.marca
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() === q
    ) ?? null
  );
}

/** Columnas que esa tabla realmente tiene cargadas. */
export function columnasDe(tabla: TablaTalle): ClaveMedida[] {
  const claves: ClaveMedida[] = ["largo", "pecho", "hombro", "manga", "ruedo"];
  return claves.filter((c) => tabla.filas.some((f) => typeof f[c] === "number"));
}
