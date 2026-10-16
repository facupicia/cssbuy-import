/** Public storefront content only. Never put credentials or inventory costs here. */
export const WIDGET_KINDS = ["alert", "faq", "payments", "videos", "countdown"] as const;
export type WidgetKind = typeof WIDGET_KINDS[number];
export const WIDGET_LABELS: Record<WidgetKind, string> = { alert: "Mensaje de alerta", faq: "Preguntas frecuentes", payments: "Medios de pago", videos: "Slider de videos", countdown: "Cuenta regresiva" };
export const WIDGET_SLOTS = { after_dynamic_section_main_product: "Al pie de la ficha, antes de productos similares", before_product_detail_name: "Arriba del nombre del producto", after_product_detail_price: "Debajo del precio", after_product_detail_shipping_options: "Debajo de las opciones de envío", before_main_content: "Barra superior del contenido", after_header: "Debajo del encabezado", after_product_description: "Después de la descripción", after_main_content: "Al final del contenido" } as const;
export type WidgetSlot = keyof typeof WIDGET_SLOTS;
export const REFERENCE_SLOTS: Record<WidgetKind, WidgetSlot> = { alert: "before_product_detail_name", faq: "after_dynamic_section_main_product", payments: "after_product_detail_shipping_options", videos: "after_dynamic_section_main_product", countdown: "after_product_detail_price" };
export interface WidgetColors { background: string; foreground: string; highlight: string }
export const REFERENCE_COLORS: Record<WidgetKind, WidgetColors> = {
  alert: { background: "#ef4444", foreground: "#ffffff", highlight: "#f87171" },
  faq: { background: "#f7f7f7", foreground: "#333333", highlight: "#333333" },
  payments: { background: "#fafafa", foreground: "#555555", highlight: "#15803d" },
  videos: { background: "#e8e8e8", foreground: "#333333", highlight: "#cccccc" },
  countdown: { background: "#1e1e1e", foreground: "#ffffff", highlight: "#ef4444" },
};
export function widgetColors(w: StoreWidget): WidgetColors { return w.colors ?? REFERENCE_COLORS[w.kind]; }
export function countdownParts(endsAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000)) || 0;
  return [[String(Math.floor(seconds / 3600)).padStart(2,"0"),"HRS"], [String(Math.floor(seconds / 60) % 60).padStart(2,"0"),"MIN"], [String(seconds % 60).padStart(2,"0"),"SEG"]];
}
export function paymentLogo(title: string): string | undefined {
  const key = title.toLowerCase().replace(/[^a-z]/g, "");
  const logo = ({visa:"visa",mastercard:"mastercard",americanexpress:"amex",amex:"amex",naranjax:"ar_tarjeta-naranja",naranja:"ar_tarjeta-naranja",visadebito:"visadebit",pagofacil:"pagofacil",rapipago:"rapipago"} as Record<string,string>)[key];
  return logo ? `https://d26lpennugtm8s.cloudfront.net/assets/common/img/logos/payment/new_logos_payment/${logo}@2x.png` : undefined;
}
export interface StoreWidget {
  kind: WidgetKind; enabled: boolean; title: string; text: string; slot: WidgetSlot;
  scope: "all" | "products"; productIds: number[];
  entries: { title: string; text: string; url: string }[];
  endsAt: string; colors?: WidgetColors;
}
export interface WidgetConfig { widgets: StoreWidget[]; accent: string }
export function defaultWidgetConfig(): WidgetConfig {
  return { accent: "#181818", widgets: WIDGET_KINDS.map(kind => ({
    kind, enabled: false, title: WIDGET_LABELS[kind], text: kind === "alert" || kind === "payments" ? "10% de descuento pagando por transferencia." : "",
    slot: REFERENCE_SLOTS[kind], colors: { ...REFERENCE_COLORS[kind] },
    scope: "all", productIds: [], endsAt: "",
    entries: kind === "faq" ? [{ title: "¿Cómo elijo mi talle?", text: "Consultá la tabla de talles de la descripción del producto y compará las medidas con una prenda tuya.", url: "" }]
      : kind === "payments" ? [{ title: "Transferencia bancaria", text: "10% de descuento", url: "" }] : [],
  })) };
}
/** Upgrade the original unstyled layout without changing content or activation. */
export function upgradeWidgetDesign(config: WidgetConfig): WidgetConfig {
  return { ...config, widgets: config.widgets.map(w => w.colors ? w : { ...w, slot: REFERENCE_SLOTS[w.kind], colors: { ...REFERENCE_COLORS[w.kind] } }) };
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
    if (w.colors !== undefined) {
      const colors = w.colors;
      if (!colors || typeof colors !== "object" || ["background","foreground","highlight"].some(k => typeof colors[k as keyof WidgetColors] !== "string" || !/^#[0-9a-f]{6}$/i.test(colors[k as keyof WidgetColors]))) throw new Error("Color del bloque inválido");
      result.colors = { background: w.colors.background, foreground: w.colors.foreground, highlight: w.colors.highlight };
    }
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
