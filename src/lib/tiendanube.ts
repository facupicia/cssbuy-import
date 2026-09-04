import { InventoryItem } from "./types";
import { calcInventoryItem } from "./inventory";
import { generarDescripcionHTML } from "./descripcion";

/**
 * Exportación al CSV de carga masiva de Tiendanube.
 *
 * Los encabezados salen de la documentación oficial y el orden importa: el
 * importador identifica las columnas por el texto exacto de la primera fila.
 * Si Tiendanube cambia la plantilla, se ajusta acá y nada más.
 *
 * Nota: el CSV de Tiendanube NO carga imágenes. Las fotos se suben aparte
 * desde el panel o con una app del store. Por eso el flujo recomendado es
 * importar con "Mostrar en tienda" = NO, cargar las fotos y recién ahí
 * publicar.
 *
 * https://ayuda.tiendanube.com/es_ES/122710-importar-y-exportar-productos
 */
export const TIENDANUBE_COLUMNS = [
  "Identificador de URL",
  "Nombre",
  "Categorías",
  "Nombre de la propiedad 1",
  "Valor de propiedad 1",
  "Nombre de la propiedad 2",
  "Valor de propiedad 2",
  "Nombre de la propiedad 3",
  "Valor de propiedad 3",
  "Precio",
  "Precio promocional",
  "Peso",
  "Alto",
  "Ancho",
  "Profundidad",
  "Stock",
  "SKU",
  "Código de barras",
  "Mostrar en tienda",
  "Envío sin cargo",
  "Descripción",
  "Tags",
  "Título para SEO",
  "Descripción para SEO",
  "Marca",
  "Producto físico",
  "MPN",
  "Sexo",
  "Rango de edad",
  "Costo",
  "Visibilidad",
] as const;

export interface TiendanubeOptions {
  /** Categoría a asignar a todos los productos ("Ropa > Camperas"). */
  categoria?: string;
  /** Marca de respaldo, para los productos que no tengan una asignada. */
  marca?: string;
  /** id de marca -> nombre, para escribir la marca real de cada producto. */
  nombreDeMarca?: Record<string, string>;
  /**
   * Publicar de una. Por defecto NO, porque las fotos se cargan después y
   * conviene que el producto no aparezca vacío en la tienda.
   */
  mostrarEnTienda?: boolean;
  /** Redondear el precio a múltiplos de N pesos (0 = sin redondeo). */
  redondearA?: number;
  /** Incluir el costo unitario en la columna Costo. */
  incluirCosto?: boolean;
  /**
   * Escribir la descripción como HTML (ficha + tabla de talles de la marca).
   * Si se apaga, va el texto de las notas tal cual.
   */
  descripcionHTML?: boolean;
}

/**
 * "Campera North Face  Ñandú/L" -> "campera-north-face-nandu-l"
 * Tiendanube exige el identificador sin mayúsculas, tildes, ñ ni especiales.
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca los diacriticos que dejo el NFD
    .replace(/ñ/gi, "n")
    .toLowerCase()
    // separadores que en un nombre hacen de espacio: "negro/L" -> "negro-l"
    .replace(/[/\\|_.,+]/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export interface Propiedad {
  nombre: string;
  valor: string;
}

/**
 * Parte el campo libre de variante en propiedades para Tiendanube.
 *
 * CSSBuy las manda como "Color:194 negro;Tamaño:XL", que mapea derecho a
 * nombre/valor. Cuando no tiene esa forma ("negro / L"), se cae a una sola
 * propiedad llamada "Variante" con el texto tal cual.
 */
/**
 * Los vendedores nombran la misma propiedad de formas distintas (Size, Talla,
 * 尺码…). Se unifican para que en la tienda no aparezcan propiedades en chino
 * ni tres variantes de "talle" que el cliente ve como filtros separados.
 */
const NOMBRE_CANONICO: Record<string, string> = {
  size: "Talle",
  talla: "Talle",
  talle: "Talle",
  "tamaño": "Talle",
  tamano: "Talle",
  "尺码": "Talle",
  "尺寸": "Talle",
  color: "Color",
  colores: "Color",
  colour: "Color",
  "颜色": "Color",
};

export function parseVariante(variante?: string | null): Propiedad[] {
  const texto = (variante || "").trim();
  if (!texto) return [];

  const partes = texto.split(";").map((p) => p.trim()).filter(Boolean);
  const props: Propiedad[] = [];

  for (const parte of partes) {
    const i = parte.indexOf(":");
    if (i > 0) {
      const crudo = parte.slice(0, i).trim();
      const nombre = NOMBRE_CANONICO[crudo.toLowerCase()] ?? crudo;
      const valor = parte.slice(i + 1).trim();
      if (nombre && valor) props.push({ nombre, valor });
    }
  }

  if (props.length > 0) return props.slice(0, 3);
  return [{ nombre: "Variante", valor: texto }];
}

function redondear(n: number, a: number): number {
  if (!a || a <= 0) return Math.round(n);
  return Math.round(n / a) * a;
}

/** Escapa un campo para CSV: comillas dobles y separadores. */
function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface TiendanubeRowsResult {
  csv: string;
  filas: number;
  /** Ítems salteados por no tener stock o nombre. */
  omitidos: { nombre: string; motivo: string }[];
}

export function buildTiendanubeCSV(
  items: InventoryItem[],
  opts: TiendanubeOptions = {}
): TiendanubeRowsResult {
  const {
    categoria = "",
    marca = "",
    nombreDeMarca = {},
    mostrarEnTienda = false,
    redondearA = 0,
    incluirCosto = true,
    descripcionHTML = true,
  } = opts;

  const omitidos: { nombre: string; motivo: string }[] = [];
  const filas: string[] = [];
  const usados = new Map<string, number>();

  for (const it of items) {
    const nombre = (it.nombre || "").trim();
    if (!nombre) {
      omitidos.push({ nombre: it.sku || it.id, motivo: "sin nombre" });
      continue;
    }

    const c = calcInventoryItem(it);
    if (c.stock <= 0) {
      omitidos.push({ nombre, motivo: "sin stock" });
      continue;
    }

    // El identificador tiene que ser único en el archivo.
    const base = slugify(nombre) || "producto";
    const vistas = usados.get(base) ?? 0;
    usados.set(base, vistas + 1);
    const identificador = vistas === 0 ? base : `${base}-${vistas + 1}`;

    const props = parseVariante(it.variante);
    const precio = redondear(c.precioVentaARS, redondearA);

    const fila: Record<string, string | number> = {
      "Identificador de URL": identificador,
      Nombre: nombre,
      Categorías: categoria,
      "Nombre de la propiedad 1": props[0]?.nombre ?? "",
      "Valor de propiedad 1": props[0]?.valor ?? "",
      "Nombre de la propiedad 2": props[1]?.nombre ?? "",
      "Valor de propiedad 2": props[1]?.valor ?? "",
      "Nombre de la propiedad 3": props[2]?.nombre ?? "",
      "Valor de propiedad 3": props[2]?.valor ?? "",
      Precio: precio > 0 ? precio : "",
      "Precio promocional": "",
      Peso: "", // el inventario no guarda peso todavía
      Alto: "",
      Ancho: "",
      Profundidad: "",
      Stock: c.stock,
      SKU: it.sku ?? "",
      "Código de barras": "",
      "Mostrar en tienda": mostrarEnTienda ? "SI" : "NO",
      "Envío sin cargo": "NO",
      Descripción: descripcionHTML
        ? generarDescripcionHTML(it, {
            marca: it.marcaId ? nombreDeMarca[it.marcaId] : null,
            // Las notas del ítem funcionan como el párrafo de venta.
            pitch: it.notas || undefined,
          })
        : it.notas ?? "",
      Tags: "",
      "Título para SEO": "",
      "Descripción para SEO": "",
      // La marca del producto manda; el campo del diálogo es el respaldo.
      Marca: (it.marcaId && nombreDeMarca[it.marcaId]) || marca,
      "Producto físico": "SI",
      MPN: "",
      Sexo: "",
      "Rango de edad": "",
      Costo: incluirCosto && c.costoUnitARS > 0 ? Math.round(c.costoUnitARS) : "",
      Visibilidad: mostrarEnTienda ? "Visible" : "Oculto",
    };

    filas.push(TIENDANUBE_COLUMNS.map((col) => csvCell(fila[col])).join(","));
  }

  // BOM para que Excel abra bien los acentos.
  const csv = "\ufeff" + [TIENDANUBE_COLUMNS.join(","), ...filas].join("\n");
  return { csv, filas: filas.length, omitidos };
}
