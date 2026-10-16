import type { NubeSDK, NubeComponent } from "@tiendanube/nube-sdk-types";
import { Accordion, Box, Button, Column, Image, Row, Svg, Text, Video } from "@tiendanube/nube-sdk-jsx";
import { upgradeWidgetDesign, countdownParts, paymentLogo, widgetColors, videoSource, widgetApplies, WIDGET_SLOTS, type WidgetConfig, type StoreWidget, type WidgetSlot } from "../src/lib/store-widgets";

const API = "https://db.vidaeventofiesta.site/api/storefront/widgets";
type VideoControls = { index: number; select: (index: number) => void };
export function renderWidget(w: StoreWidget, accent: string, videoControls?: VideoControls): NubeComponent {
  const c = widgetColors(w);
  const text = (children: string, style: Parameters<typeof Text>[0]["style"] = {}) => Text({ children, style: { margin: "0px", fontSize: "14px", lineHeight: "1.4", color: c.foreground, ...style } });
  const frame = (children: NubeComponent[], style: Parameters<typeof Column>[0]["style"] = {}) => Column({ id: `plug-widget-${w.kind}`, width: "100%", children, style: { boxSizing: "border-box", minWidth: "0px", overflowWrap: "anywhere", ...style } });
  if (w.kind === "alert") return frame([Row({ children: [Box({ style: { width:"14px",height:"14px",borderRadius:"50%",backgroundColor:c.highlight,flexShrink:"0" } }), text(w.text)], style: { width:"fit-content",maxWidth:"100%",alignItems:"center",gap:"8px",backgroundColor:c.background,borderRadius:"25px",padding:"10px 20px",margin:"5px 0px 10px",boxSizing:"border-box" } })]);
  if (w.kind === "faq") return frame([...(w.text?[text(w.text,{whiteSpace:"pre-wrap"})]:[]),...w.entries.map((e,i) => Accordion.Root({ id:`plug-faq-${i}`, style:{backgroundColor:c.background,borderRadius:"5px",overflow:"hidden",width:"100%"},children: Accordion.Item({ value:`plug-faq-${i}`,children:[
    Accordion.Header({ showIcon:true,style:{padding:"18px",color:c.foreground,fontSize:"14px",fontWeight:"600",lineHeight:"1.4",border:"none",backgroundColor:c.background,textAlign:"left"},children:Row({style:{alignItems:"center",gap:"8px"},children:[Svg.Root({width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:c.highlight,strokeWidth:2,children:[Svg.Circle({cx:12,cy:12,r:10}),Svg.Path({d:"M12 11v6M12 7h.01"})]}),text(e.title,{fontWeight:"600"})]}) }),
    Accordion.Content({ children:Box({style:{padding:"0px 18px 18px",backgroundColor:c.background},children:text(e.text,{whiteSpace:"pre-wrap"})}) }),
  ]}) }))],{gap:"10px",margin:"15px 0px 25px"});
  if (w.kind === "payments") return frame([
    Row({style:{flexWrap:"wrap",justifyContent:"center",gap:"6px"},children:w.entries.map((e,i)=>Box({id:`plug-payment-${i}`,style:{backgroundColor:"#ffffff",borderRadius:"6px",padding:"4px",minWidth:"56px",minHeight:"36px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"},children:paymentLogo(e.title)?Image({src:paymentLogo(e.title)! as `https://${string}`,alt:e.title,width:"46px",height:"26px",style:{objectFit:"contain"}}):text(e.title,{fontWeight:"600",fontSize:"12px",textAlign:"center"})}))}),
    ...w.entries.filter(e=>e.text).map(e=>text(`${e.title}: ${e.text}`,{fontSize:"13px",color:c.highlight,textAlign:"center"})),
    ...(w.text?[text(w.text,{fontSize:"13px",textAlign:"center"})]:[]),
  ],{backgroundColor:c.background,border:"1px solid #eeeeee",borderRadius:"8px",padding:"23px",gap:"15px",margin:"10px 0px 15px"});
  if (w.kind === "countdown") return frame([Row({style:{alignItems:"center",justifyContent:"space-between",gap:"16px",flexWrap:"wrap"},children:[
    Column({style:{flex:"1",minWidth:"100px",gap:"6px"},children:[text(w.title,{fontSize:"16px",fontWeight:"700"}),...(w.text?[text(w.text,{fontSize:"11px",fontWeight:"700",backgroundColor:"#fdc624",color:"#000000",padding:"5px 10px",borderRadius:"4px",width:"fit-content"})]:[])]}),
    Row({id:"plug-countdown-value",style:{gap:"6px",alignItems:"center"},children:countdownParts(w.endsAt).flatMap(([value,label],i)=>[
      ...(i?[text(":",{fontSize:"20px",fontWeight:"700"})]:[]),
      Column({style:{backgroundColor:c.highlight,borderRadius:"5px",padding:"10px 12px",minWidth:"50px",minHeight:"54px",boxSizing:"border-box",alignItems:"center",justifyContent:"center",gap:"2px"},children:[text(value,{fontSize:"16px",fontWeight:"700",lineHeight:"1",fontVariantNumeric:"tabular-nums"}),text(label,{fontSize:"10px",lineHeight:"1"})]})
    ])})
  ]})],{backgroundColor:c.background,borderRadius:"5px",padding:"15px",margin:"0px 0px 20px"});
  const index = Math.min(videoControls?.index ?? 0, Math.max(0,w.entries.length-1));
  const card = (i:number,center:boolean) => {
    const e=w.entries[(i+w.entries.length)%w.entries.length];
    return Column({id:`plug-video-${i}`,style:{width:center?"56%":"22%",flexShrink:"0",minWidth:"0px",borderRadius:"20px",overflow:"hidden",gap:"8px",alignSelf:"center"},children:[Box({style:{position:"relative",aspectRatio:center?"9 / 16":"0.220982",width:"100%",overflow:"hidden",borderRadius:"20px",backgroundColor:c.background},children:Video.Root({width:center?"100%":"254.545%",style:{aspectRatio:"9 / 16",position:"absolute",top:"0px",left:"50%",transform:"translateX(-50%)",borderRadius:"20px",overflow:"hidden"},children:videoSource(e.url)==="youtube"?Video.YouTube({src:e.url,controls:true}):Video.Player({src:e.url as `https://${string}`,controls:true,aspectRatio:"9/16"})})}),text(e.title,{fontSize:"12px",textAlign:"center"})]});
  };
  const arrow=(direction:number)=>Button({variant:"transparent",ariaLabel:direction<0?"Video anterior":"Video siguiente",onClick:()=>videoControls?.select((index+direction+w.entries.length)%w.entries.length),style:{width:"42px",height:"42px",minWidth:"42px",padding:"0px",border:"none",borderRadius:"50%",backgroundColor:c.background,color:c.foreground,display:"flex",alignItems:"center",justifyContent:"center"},children:Svg.Root({width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:c.foreground,strokeWidth:2,children:Svg.Path({d:direction<0?"m15 6-6 6 6 6":"m9 6 6 6-6 6"})})});
  return frame(w.entries.length ? [...(w.text?[text(w.text,{whiteSpace:"pre-wrap"})]:[]),Row({style:{alignItems:"center",justifyContent:"center",gap:"12px",overflow:"hidden",width:"100%",minWidth:"0px"},children:w.entries.length>1?[card(index-1,false),card(index,true),card(index+1,false)]:[card(index,true)]}),...(w.entries.length>1?[Row({style:{justifyContent:"center",alignItems:"center",gap:"10px",marginTop:"10px"},children:[arrow(-1),...w.entries.map((_,i)=>Button({ariaLabel:`Ver video ${i+1}`,onClick:()=>videoControls?.select(i),style:{width:"10px",minWidth:"10px",height:"10px",minHeight:"10px",padding:"0px",border:"none",borderRadius:"50%",backgroundColor:i===index?c.foreground:c.highlight}})),arrow(1)]})]:[])] : [],{margin:"20px 0px",paddingBottom:"16px"});
}
/** Worker entry point: only public configuration is fetched; no shop/customer/cart data leaves the worker. */
export async function App(nube: NubeSDK) {
  let config: WidgetConfig = { accent: "#181818", widgets: [] };
  let owned = new Set<WidgetSlot>();
  let activeStore = 0; let fetching = false;
  const videoIndices = new Map<string,number>();
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
      if (widgets.length) nube.render(slot, Column({ id: `plug-slot-${slot}`, width: "100%", gap: "16px", children: widgets.map(w => renderWidget(w, config.accent, { index:videoIndices.get(w.kind) ?? 0, select:index=>{videoIndices.set(w.kind,index);render();} })) }));
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
