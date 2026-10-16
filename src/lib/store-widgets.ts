/** Public storefront content only. Never put credentials or inventory costs here. */
export const WIDGET_KINDS = ["alert", "faq", "payments", "videos", "countdown"] as const;
export type WidgetKind = typeof WIDGET_KINDS[number];
export const WIDGET_LABELS: Record<WidgetKind, string> = { alert: "Mensaje de alerta", faq: "Preguntas frecuentes", payments: "Medios de pago", videos: "Slider de videos", countdown: "Cuenta regresiva" };
export const WIDGET_SLOTS = { after_header: "Debajo del encabezado", after_product_detail_price: "Debajo del precio", after_product_description: "Después de la descripción", after_main_content: "Al final del contenido" } as const;
export type WidgetSlot = keyof typeof WIDGET_SLOTS;
export interface StoreWidget {
  kind: WidgetKind; enabled: boolean; title: string; text: string; slot: WidgetSlot;
  scope: "all" | "products"; productIds: number[];
  entries: { title: string; text: string; url: string }[];
  endsAt: string;
}
export interface WidgetConfig { widgets: StoreWidget[]; accent: string }
export function defaultWidgetConfig(): WidgetConfig {
  return { accent: "#181818", widgets: WIDGET_KINDS.map(kind => ({
    kind, enabled: false, title: WIDGET_LABELS[kind], text: kind === "alert" || kind === "payments" ? "10% de descuento pagando por transferencia." : "",
    slot: kind === "alert" ? "after_header" : kind === "payments" || kind === "countdown" ? "after_product_detail_price" : "after_product_description",
    scope: "all", productIds: [], endsAt: "",
    entries: kind === "faq" ? [{ title: "¿Cómo elijo mi talle?", text: "Consultá la tabla de talles de la descripción del producto y compará las medidas con una prenda tuya.", url: "" }]
      : kind === "payments" ? [{ title: "Transferencia bancaria", text: "10% de descuento", url: "" }] : [],
  })) };
}
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit) throw new Error("Revisá la extensión de los textos");
  return value.trim();
}
export function videoSource(raw: string): "youtube" | "file" {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Los videos necesitan una URL pública HTTPS");
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : url.searchParams.get("v");
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error("Pegá el enlace completo del video de YouTube");
    return "youtube";
  }
  if (!/\.(mp4|m3u8|mpd)$/i.test(url.pathname)) throw new Error("Usá un enlace directo MP4, HLS, DASH o un video de YouTube");
  return "file";
}
export function parseWidgetConfig(input: unknown): WidgetConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuración inválida");
  const raw = input as Record<string, unknown>;
  if (typeof raw.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(raw.accent)) throw new Error("Color inválido");
  if (!Array.isArray(raw.widgets) || raw.widgets.length !== 5) throw new Error("La configuración debe incluir los cinco bloques");
  const seen = new Set<string>();
  const widgets = raw.widgets.map((entry: unknown): StoreWidget => {
    if (!entry || typeof entry !== "object") throw new Error("Bloque inválido");
    const w = entry as StoreWidget;
    if (!WIDGET_KINDS.includes(w.kind) || seen.has(w.kind)) throw new Error("Tipo de bloque inválido o repetido"); seen.add(w.kind);
    if (typeof w.enabled !== "boolean" || !Object.hasOwn(WIDGET_SLOTS, w.slot) || !["all", "products"].includes(w.scope)) throw new Error("Ubicación o alcance inválido");
    if (!Array.isArray(w.productIds) || w.productIds.length > 500 || w.productIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Productos inválidos");
    if (!Array.isArray(w.entries) || w.entries.length > 20) throw new Error("Podés agregar hasta 20 elementos por bloque");
    const result: StoreWidget = { kind: w.kind, enabled: w.enabled, title: text(w.title, 160), text: text(w.text, 2000), slot: w.slot, scope: w.scope,
      productIds: [...new Set(w.productIds)], endsAt: text(w.endsAt, 40), entries: w.entries.map(e => ({ title: text(e.title, 160), text: text(e.text, 2000), url: text(e.url, 2000) })) };
    if (result.endsAt && !/^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$/.test(result.endsAt)) throw new Error("Fecha inválida");
    if (result.endsAt && !Number.isFinite(Date.parse(result.endsAt))) throw new Error("Fecha inválida");
    if (result.kind === "videos") for (const e of result.entries) videoSource(e.url);
    if (result.enabled) {
      if (!result.title) throw new Error("Completá el título del bloque");
      if (result.scope === "products" && !result.productIds.length) throw new Error("Seleccioná al menos un producto o elegí todos");
      if (["faq", "payments", "videos"].includes(result.kind) && (!result.entries.length || result.entries.some(e => !e.title || (result.kind === "faq" && !e.text)))) throw new Error("Completá los elementos del bloque");
      if (result.kind === "alert" && !result.text) throw new Error("Completá el mensaje de alerta");
      if (result.kind === "countdown" && !result.endsAt) throw new Error("Elegí cuándo termina la cuenta regresiva");
    }
    return result;
  });
  return { accent: raw.accent, widgets };
}
export function widgetApplies(w: StoreWidget, productId?: number, now = Date.now()): boolean {
  return w.enabled && (w.scope === "all" || Boolean(productId && w.productIds.includes(productId)))
    && (w.kind !== "countdown" || Date.parse(w.endsAt) > now);
}
export function countdownText(endsAt: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  if (!Number.isFinite(seconds) || seconds === 0) return "Finalizada";
  return `${Math.floor(seconds / 86400)}d ${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
}
