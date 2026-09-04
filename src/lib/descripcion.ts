import { InventoryItem } from "./types";
import { parseTalle, parseColor } from "./variantes";
import {
  tablaDeMarca,
  columnasDe,
  ETIQUETA_MEDIDA,
  type TablaTalle,
} from "./tablas-talle";

/**
 * Arma la descripción HTML del producto para Tiendanube.
 *
 * Tiendanube sanitiza el HTML: solo deja pasar
 *   a b br div em h1..h6 i iframe img ol li p s span strong table thead th
 *   tbody tr td u ul
 * y permite `style` en línea, pero NO bloques <style> ni scripts.
 *
 * Por eso acá no hay clases ni media queries: todo va inline, y el ancho se
 * expresa en porcentajes para que la tabla no rompa en el celular.
 *
 * https://ayuda.tiendanube.com/es_CO/123233-paginas/reglas-para-ingresar-html-en-las-paginas-de-contenido
 */

export interface OpcionesDescripcion {
  /** Nombre de la marca, para elegir la tabla de talles. */
  marca?: string | null;
  /** Título visible. Por defecto, el nombre del producto. */
  titulo?: string;
  /** Párrafo de venta. */
  pitch?: string;
  /** Muestra la fila del talle de este producto resaltada. */
  resaltarTalle?: boolean;
  /** Bloque de envíos y cambios. */
  incluirEnvios?: boolean;
  /** Bloque de cuidado de la prenda. */
  incluirCuidado?: boolean;
}

const ACENTO = "#0f766e";
const TINTA = "#1c1917";
const SUAVE = "#57534e";
const BORDE = "#e7e5e4";
const FONDO_SUAVE = "#f5f5f4";

/** Escapa texto para que no rompa el HTML ni lo sanitice Tiendanube. */
function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seccion(titulo: string, cuerpo: string): string {
  return (
    `<h3 style="margin:24px 0 10px;font-size:15px;font-weight:700;color:${TINTA};` +
    `letter-spacing:.02em;text-transform:uppercase;">${esc(titulo)}</h3>${cuerpo}`
  );
}

function tablaHTML(tabla: TablaTalle, talleActual?: string | null): string {
  const cols = columnasDe(tabla);
  const traeAltura = tabla.filas.some((f) => f.alturaCm);
  const traePeso = tabla.filas.some((f) => f.pesoKg);

  const th =
    `padding:9px 8px;font-size:12px;font-weight:700;color:#ffffff;` +
    `background:${ACENTO};text-align:center;`;
  const td = `padding:9px 8px;font-size:13px;color:${TINTA};text-align:center;border-bottom:1px solid ${BORDE};`;

  let head = `<tr><th style="${th}text-align:left;">Talle</th>`;
  for (const c of cols) head += `<th style="${th}">${ETIQUETA_MEDIDA[c]}</th>`;
  if (traeAltura) head += `<th style="${th}">Altura</th>`;
  if (traePeso) head += `<th style="${th}">Peso</th>`;
  head += "</tr>";

  let body = "";
  for (const f of tabla.filas) {
    const activa = talleActual && f.talle.toUpperCase() === talleActual.toUpperCase();
    // La fila del talle que se está comprando va resaltada: es el dato que
    // la persona busca, y así no tiene que rastrearlo en la grilla.
    const fondo = activa ? `background:${ACENTO}14;` : "";
    const peso = activa ? "font-weight:700;" : "";
    body += `<tr style="${fondo}">`;
    body += `<td style="${td}text-align:left;font-weight:700;${peso}">${esc(f.talle)}</td>`;
    for (const c of cols) {
      const v = f[c];
      body += `<td style="${td}${peso}">${typeof v === "number" ? `${v} cm` : "&mdash;"}</td>`;
    }
    if (traeAltura) body += `<td style="${td}${peso}">${f.alturaCm ? `${esc(f.alturaCm)} cm` : "&mdash;"}</td>`;
    if (traePeso) body += `<td style="${td}${peso}">${f.pesoKg ? `${esc(f.pesoKg)} kg` : "&mdash;"}</td>`;
    body += "</tr>";
  }

  return (
    `<div style="overflow-x:auto;">` +
    `<table style="width:100%;border-collapse:collapse;margin:0;min-width:320px;">` +
    `<thead>${head}</thead><tbody>${body}</tbody></table></div>` +
    `<p style="margin:10px 0 0;font-size:12px;color:${SUAVE};line-height:1.5;">` +
    `Medidas de la prenda apoyada y estirada, en centímetros. ` +
    (tabla.nota ? esc(tabla.nota) + " " : "") +
    `Puede haber una diferencia de 1 a 3 cm según cómo se mida.</p>`
  );
}

const COMO_MEDIR = [
  ["Pecho", "Apoyá una remera tuya que te quede bien y medí de axila a axila. Multiplicá por 2 y comparalo con la columna Pecho."],
  ["Largo", "Desde el punto más alto del hombro, al lado del cuello, hasta el ruedo de abajo."],
  ["Hombros", "De costura a costura de hombro, por la espalda."],
  ["Manga", "Desde la costura del hombro hasta el borde de la manga."],
];

export function generarDescripcionHTML(
  item: Pick<InventoryItem, "nombre" | "variante" | "notas">,
  opts: OpcionesDescripcion = {}
): string {
  const {
    marca,
    titulo = item.nombre,
    pitch,
    resaltarTalle = true,
    incluirEnvios = true,
    incluirCuidado = true,
  } = opts;

  const talle = parseTalle(item.variante);
  const color = parseColor(item.variante);
  const tabla = tablaDeMarca(marca);

  const p = `margin:0 0 12px;font-size:14px;line-height:1.65;color:${TINTA};`;
  const partes: string[] = [];

  partes.push(`<div style="font-family:inherit;color:${TINTA};max-width:760px;">`);

  // Encabezado
  if (marca) {
    partes.push(
      `<div style="font-size:12px;font-weight:700;letter-spacing:.12em;` +
        `text-transform:uppercase;color:${ACENTO};margin:0 0 6px;">${esc(marca)}</div>`
    );
  }
  partes.push(
    `<h2 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;color:${TINTA};">${esc(titulo)}</h2>`
  );

  if (pitch) partes.push(`<p style="${p}">${esc(pitch)}</p>`);
  else if (item.notas) partes.push(`<p style="${p}">${esc(item.notas)}</p>`);

  // Ficha rápida: solo lo que realmente sabemos del producto
  const ficha: [string, string][] = [];
  if (color) ficha.push(["Color", color]);
  if (talle) ficha.push(["Talle", talle]);
  if (marca) ficha.push(["Marca", marca]);
  if (ficha.length > 0) {
    const chips = ficha
      .map(
        ([k, v]) =>
          `<span style="display:inline-block;padding:6px 12px;margin:0 6px 6px 0;` +
          `background:${FONDO_SUAVE};border:1px solid ${BORDE};border-radius:999px;` +
          `font-size:13px;color:${TINTA};"><strong>${esc(k)}:</strong> ${esc(v)}</span>`
      )
      .join("");
    partes.push(`<div style="margin:0 0 18px;">${chips}</div>`);
  }

  // Tabla de talles
  if (tabla) {
    partes.push(seccion(`Tabla de talles · ${tabla.marca}`, tablaHTML(tabla, resaltarTalle ? talle : null)));
  } else {
    partes.push(
      seccion(
        "Tabla de talles",
        `<p style="${p}">Escribinos y te pasamos las medidas exactas de esta prenda antes de que compres.</p>`
      )
    );
  }

  // Cómo medir
  partes.push(
    seccion(
      "Cómo saber tu talle",
      `<p style="${p}">La forma más segura es medir una prenda que ya tengas y compararla con la tabla.</p>` +
        `<ul style="margin:0;padding-left:20px;color:${TINTA};font-size:14px;line-height:1.7;">` +
        COMO_MEDIR.map(([k, v]) => `<li style="margin-bottom:6px;"><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join("") +
        `</ul>`
    )
  );

  if (incluirCuidado) {
    partes.push(
      seccion(
        "Cuidado de la prenda",
        `<ul style="margin:0;padding-left:20px;color:${TINTA};font-size:14px;line-height:1.7;">` +
          `<li style="margin-bottom:6px;">Lavar a mano o en ciclo delicado con agua fría.</li>` +
          `<li style="margin-bottom:6px;">Lavar del revés para cuidar la estampa.</li>` +
          `<li style="margin-bottom:6px;">No usar lavandina ni secarropas.</li>` +
          `<li style="margin-bottom:6px;">Planchar del revés y sin pasar por encima de la estampa.</li>` +
          `</ul>`
      )
    );
  }

  if (incluirEnvios) {
    partes.push(
      seccion(
        "Envíos y cambios",
        `<p style="${p}">Hacemos envíos a todo el país. Si el talle no te va, escribinos y lo cambiamos.</p>`
      )
    );
  }

  partes.push("</div>");
  return partes.join("");
}

/** Versión en texto plano, por si hace falta un resumen sin formato. */
export function descripcionATexto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
