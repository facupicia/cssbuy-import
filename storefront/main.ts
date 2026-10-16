import type { NubeSDK, NubeComponent } from "@tiendanube/nube-sdk-types";
import { Accordion, Column, SideScroll, Text, Video } from "@tiendanube/nube-sdk-jsx";
import { countdownText, videoSource, widgetApplies, WIDGET_SLOTS, type WidgetConfig, type StoreWidget, type WidgetSlot } from "../src/lib/store-widgets";

const API = "https://db.vidaeventofiesta.site/api/storefront/widgets";
export function renderWidget(w: StoreWidget, accent: string): NubeComponent {
  const children: NubeComponent[] = [Text({ children: w.title, style: { fontSize: "18px", fontWeight: "600", color: accent } })];
  if (w.text) children.push(Text({ children: w.text, style: { whiteSpace: "pre-wrap" } }));
  if (w.kind === "faq") children.push(Accordion.Root({ id: "plug-faq", children: w.entries.map((e,i) => Accordion.Item({ value: `plug-faq-${i}`, children: [Accordion.Header({ children: e.title, showIcon: true }), Accordion.Content({ children: Text({ children: e.text, style: { whiteSpace: "pre-wrap" } }) })] })) }));
  if (w.kind === "payments") for (const [i,e] of w.entries.entries()) children.push(Column({ id: `plug-payment-${i}`, gap: "4px", children: [Text({ children: e.title, style: { fontWeight: "600" } }), Text({ children: e.text })] }));
  if (w.kind === "countdown") children.push(Text({ id: "plug-countdown-value", children: countdownText(w.endsAt), style: { fontSize: "24px", fontWeight: "600", fontVariantNumeric: "tabular-nums" } }));
  if (w.kind === "videos") children.push(SideScroll({ gap: "16px", hideScrollbar: false, children: w.entries.map((e,i) => Column({ id: `plug-video-${i}`, width: "240px", gap: "8px", children: [
    Video.Root({ width: "240px", children: videoSource(e.url) === "youtube" ? Video.YouTube({ src: e.url, controls: true }) : Video.Player({ src: e.url as `https://${string}`, controls: true }) }), Text({ children: e.title }),
  ] })) }));
  return Column({ id: `plug-widget-${w.kind}`, gap: "12px", padding: "16px", width: "100%", style: { boxSizing: "border-box", overflowWrap: "anywhere" }, children });
}
/** Worker entry point: only public configuration is fetched; no shop/customer/cart data leaves the worker. */
export async function App(nube: NubeSDK) {
  let config: WidgetConfig = { accent: "#181818", widgets: [] };
  let owned = new Set<WidgetSlot>();
  let activeStore = 0; let fetching = false;
  function render(onlyClock = false) {
    const page = nube.getState().location.page;
    if (page.type === "checkout") return;
    const productId = page.type === "product" ? page.data.product.id : undefined;
    const next = new Set<WidgetSlot>();
    for (const slot of Object.keys(WIDGET_SLOTS) as WidgetSlot[]) {
      if (slot.includes("product") && !productId) continue;
      const widgets = config.widgets.filter(w => w.slot === slot && widgetApplies(w, productId));
      if (widgets.length) next.add(slot);
      const clockSlot = config.widgets.some(w => w.kind === "countdown" && w.enabled && w.slot === slot);
      if (onlyClock && !clockSlot) continue;
      if (widgets.length) nube.render(slot, Column({ id: `plug-slot-${slot}`, width: "100%", gap: "16px", children: widgets.map(w => renderWidget(w, config.accent)) }));
      else if (owned.has(slot)) nube.clearSlot(slot);
    }
    // Slots owned by this app only; never clear other app content.
    if (!onlyClock) for (const slot of owned) if (!next.has(slot)) nube.clearSlot(slot);
    owned = next;
  }
  async function refresh() {
    if (fetching) return; fetching = true;
    try {
      const storeId = nube.getState().store.id;
      if (activeStore !== storeId) { config = { accent: "#181818", widgets: [] }; activeStore = storeId; render(); }
      const response = await fetch(`${API}?store=${storeId}`, { credentials: "omit", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      config = await response.json() as WidgetConfig;
      render();
    } catch { /* Keep the last working public configuration on transient network failure. */ }
    finally { fetching = false; }
  }
  nube.on("page:loaded", () => { render(); void refresh(); });
  await refresh();
  setInterval(() => { if (config.widgets.some(w => w.kind === "countdown" && w.enabled)) render(true); }, 1000);
  setInterval(() => { void refresh(); }, 60000);
}
