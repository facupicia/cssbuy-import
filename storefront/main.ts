import type { NubeSDK, NubeComponent } from "@tiendanube/nube-sdk-types";
import { Box, Button, Column, Image, Iframe, Row, Svg, Text } from "@tiendanube/nube-sdk-jsx";
import { countdownEnd, upgradeWidgetDesign, countdownParts, paymentLogo, widgetColors, widgetApplies, WIDGET_SLOTS, type WidgetConfig, type StoreWidget, type WidgetSlot } from "../src/lib/store-widgets";

const API = "https://db.vidaeventofiesta.site/api/storefront/widgets";
export function renderWidget(w: StoreWidget, accent: string, videoContext?: { storeId: string | number; productId?: number }): NubeComponent {
  const c = widgetColors(w);
  const text = (children: string, style: Parameters<typeof Text>[0]["style"] = {}) => Text({ children, style: { margin: "0px", fontSize: "14px", lineHeight: "1.4", color: c.foreground, ...style } });
  const frame = (children: NubeComponent[], style: Parameters<typeof Column>[0]["style"] = {}) => Column({ id: `plug-widget-${w.kind}`, width: "100%", children, style: { boxSizing: "border-box", minWidth: "0px", overflowWrap: "anywhere", ...style } });
  if (w.kind === "alert") return frame([Row({ children: [Box({ id:w.pulse===false?"plug-alert-dot-static":"plug-alert-dot", style: { animation:w.pulse===false?"none":"plug-status-pulse 1.8s ease-out infinite",color:c.highlight,width:"14px",height:"14px",borderRadius:"50%",backgroundColor:c.highlight,flexShrink:"0" } }), text(w.text)], style: { width:"fit-content",maxWidth:"100%",alignItems:"center",gap:"8px",backgroundColor:c.background,borderRadius:"25px",padding:"10px 20px",margin:"5px 0px 10px",boxSizing:"border-box" } })]);
  if (w.kind === "faq") return frame([...(w.text?[text(w.text,{whiteSpace:"pre-wrap"})]:[]),...w.entries.map((e,i) => Column({id:`plug-faq-${i}`,style:{backgroundColor:c.background,borderRadius:"8px",padding:"16px",gap:"8px",width:"100%",boxSizing:"border-box"},children:[text(e.title,{fontWeight:"600",fontSize:"16px"}),text(e.text,{whiteSpace:"pre-wrap"})]}))],{gap:"16px",margin:"16px 0px 24px"});
  if (w.kind === "payments") return frame([
    Row({style:{flexWrap:"wrap",justifyContent:"center",gap:"6px"},children:w.entries.map((e,i)=>Box({id:`plug-payment-${i}`,style:{backgroundColor:"#ffffff",borderRadius:"6px",padding:"4px",minWidth:"56px",minHeight:"36px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"},children:paymentLogo(e.title)?Image({src:paymentLogo(e.title)! as `https://${string}`,alt:e.title,width:"46px",height:"26px",style:{objectFit:"contain"}}):text(e.title,{fontWeight:"600",fontSize:"12px",textAlign:"center"})}))}),
    ...w.entries.filter(e=>e.text).map(e=>text(`${e.title}: ${e.text}`,{fontSize:"13px",color:c.highlight,textAlign:"center"})),
    ...(w.text?[text(w.text,{fontSize:"13px",textAlign:"center"})]:[]),
  ],{backgroundColor:c.background,border:"1px solid #eeeeee",borderRadius:"8px",padding:"23px",gap:"15px",margin:"10px 0px 15px"});
  if (w.kind === "countdown") return frame([Row({style:{alignItems:"center",justifyContent:"space-between",gap:"16px",flexWrap:"wrap"},children:[
    Column({style:{flex:"1",minWidth:"100px",gap:"6px"},children:[text(w.title,{fontSize:"16px",fontWeight:"700"}),...(w.text?[text(w.text,{fontSize:"11px",fontWeight:"700",backgroundColor:"#fdc624",color:"#000000",padding:"5px 10px",borderRadius:"4px",width:"fit-content"})]:[])]}),
    Row({id:"plug-countdown-value",style:{gap:"6px",alignItems:"center"},children:countdownParts(countdownEnd(w)).flatMap(([value,label],i)=>[
      ...(i?[text(":",{fontSize:"20px",fontWeight:"700"})]:[]),
      Column({style:{backgroundColor:c.highlight,borderRadius:"5px",padding:"10px 12px",minWidth:"50px",minHeight:"54px",boxSizing:"border-box",alignItems:"center",justifyContent:"center",gap:"2px"},children:[text(value,{fontSize:"16px",fontWeight:"700",lineHeight:"1",fontVariantNumeric:"tabular-nums"}),text(label,{fontSize:"10px",lineHeight:"1"})]})
    ])})
  ]})],{backgroundColor:c.background,borderRadius:"5px",padding:"15px",margin:"0px 0px 20px"});
  const query = videoContext ? new URLSearchParams({store:String(videoContext.storeId),...(videoContext.productId?{product:String(videoContext.productId)}:{})}).toString() : new URLSearchParams({items:JSON.stringify(w.entries.map(e=>e.url))}).toString();
  return Box({id:"plug-widget-videos",style:{boxSizing:"border-box",minWidth:"0px",width:"100%",margin:"20px auto",maxWidth:"1280px",height:"clamp(220px,32vw,360px)"},children:w.entries.length ? [Iframe({src:`https://db.vidaeventofiesta.site/storefront-carousel.html?${query}`,width:"100%",height:"100%",sandbox:"allow-scripts allow-same-origin",style:{border:"none",display:"block",width:"100%",height:"100%"}})] : []});
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
    // Ipanema exposes named legacy dynamic sections without numeric instance suffixes.
    for (const slot of Object.keys(WIDGET_SLOTS) as WidgetSlot[]) {
      if (slot.includes("product") && !productId) continue;
      // Respect the placement saved for each widget. The merchant can move the
      // FAQ and video carousel to any supported product or storefront slot.
      const widgets = config.widgets.filter(w => w.slot === slot && widgetApplies(w, productId));
      if (widgets.length) next.add(slot);
      const clockSlot = config.widgets.some(w => w.kind === "countdown" && w.enabled && w.slot === slot);
      if (onlyClock && !clockSlot) continue;
      if (widgets.length) (nube.render as (slot: WidgetSlot, node: NubeComponent) => void)(slot, Column({ id: `plug-slot-${slot}`, width: "100%", gap: "16px", style:slot==="after_dynamic_section_main_product"||slot==="after_product_description"?{maxWidth:"1280px",margin:"0px auto",padding:"0px 16px",boxSizing:"border-box"}:undefined, children: widgets.map(w => renderWidget(w, config.accent, {storeId:nube.getState().store.id,productId})) }));
      else if (owned.has(slot)) (nube.clearSlot as (slot: WidgetSlot) => void)(slot);
    }
    // Slots owned by this app only; never clear other app content.
    if (!onlyClock) for (const slot of owned) if (!next.has(slot)) (nube.clearSlot as (slot: WidgetSlot) => void)(slot);
    owned = next;
  }
  async function refresh() {
    if (fetching) return; fetching = true;
    try {
      const storeId = nube.getState().store.id;
      if (activeStore !== storeId) { config = { accent: "#181818", widgets: [] }; activeStore = storeId; render(); }
      const response = await fetch(`${API}?store=${storeId}`, { credentials: "omit", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      config = upgradeWidgetDesign(await response.json() as WidgetConfig);
      render();
    } catch { /* Keep the last working public configuration on transient network failure. */ }
    finally { fetching = false; }
  }
  nube.on("page:loaded", () => { render(); void refresh(); });
  await refresh();
  setInterval(() => { if (config.widgets.some(w => w.kind === "countdown" && w.enabled)) render(true); }, 1000);
  setInterval(() => { void refresh(); }, 60000);
}
