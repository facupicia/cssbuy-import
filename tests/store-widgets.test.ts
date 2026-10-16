import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultWidgetConfig, parseWidgetConfig, countdownEnd, upgradeWidgetDesign, widgetApplies, countdownText, videoSource } from "../src/lib/store-widgets";
import { App, renderWidget } from "../storefront/main";
import { GET, POST } from "../src/app/api/tiendanube/widgets/route";
Object.defineProperty(globalThis, "self", { value: { __APP_DATA__: { id: "46841" } }, configurable: true });

test("los videos admiten títulos vacíos y se renderizan sin controles", () => {
  const config=defaultWidgetConfig(), w=config.widgets.find(w=>w.kind==='videos')!;
  w.enabled=true; w.title=''; w.entries=[{title:'',text:'',url:'https://cdn.example.com/a.mp4'}];
  assert.doesNotThrow(()=>parseWidgetConfig(config));
  const rendered=JSON.stringify(renderWidget(w,config.accent));
  assert.ok(rendered.includes('storefront-carousel.html'));
  assert.ok(!rendered.includes('"type":"sidescroll"'));
  const carousel=readFileSync('public/storefront-carousel.html','utf8');
  assert.ok(carousel.includes('object-fit:cover'));
  assert.ok(carousel.includes('::-webkit-scrollbar{display:none'));
  assert.ok(carousel.includes('new IntersectionObserver'));
  assert.ok(carousel.includes('video.poster='));
  assert.ok(carousel.includes("video.play().catch(()=>{})"));
  assert.ok(!carousel.includes('<video controls'));
});

test("actualizar el diseño conserva la ubicación elegida y solo agrega colores faltantes", () => {
  const config=defaultWidgetConfig(); const faq=config.widgets[1];
  delete faq.colors; faq.slot="after_dynamic_section_main_product";faq.enabled=true;faq.scope="products";faq.productIds=[42];
  const next=upgradeWidgetDesign(config);assert.equal(next.widgets[1].slot,"after_dynamic_section_main_product");
  assert.deepEqual(next.widgets[1].entries,faq.entries);assert.deepEqual(next.widgets[1].productIds,[42]);assert.equal(next.widgets[1].enabled,true);
  const videos=next.widgets.find(w=>w.kind==='videos')!;videos.slot="after_product_detail_shipping_options";assert.equal(upgradeWidgetDesign(next).widgets.find(w=>w.kind==='videos')!.slot,"after_product_detail_shipping_options");
});
test("configuración pública valida medios, alcance, fechas y no acepta videos ejecutables", () => {
  const config = defaultWidgetConfig(); assert.equal(config.widgets.filter(w=>w.enabled).length,0);
  const faq = config.widgets.find(w=>w.kind==='faq')!; faq.enabled=true; faq.scope='products'; faq.productIds=[10];
  assert.deepEqual(parseWidgetConfig(config),config);
  assert.equal(widgetApplies(faq,10),true); assert.equal(widgetApplies(faq,11),false); assert.equal(widgetApplies(faq),false);
  assert.equal(videoSource('https://youtu.be/abcdefghijk'),'youtube'); assert.equal(videoSource('https://cdn.example.com/file.mp4'),'file');
  for (const url of ['javascript:alert(1)','http://example.com/a.mp4','https://user:pass@example.com/a.mp4','https://example.com/x.html','https://youtube.com/']) assert.throws(()=>videoSource(url));
  const timer=config.widgets.find(w=>w.kind==='countdown')!; timer.enabled=true; timer.endsAt='2026-10-16T00:00:00Z';
  assert.equal(widgetApplies(timer,undefined,Date.parse(timer.endsAt)),false);
  assert.equal(countdownText(timer.endsAt,Date.parse(timer.endsAt)-90061000),'1d 01h 01m 01s');
  assert.throws(()=>parseWidgetConfig({...config,widgets:[faq,faq,faq,faq,faq]}));
  assert.throws(()=>parseWidgetConfig({...config,accent:'red;display:none'}));
  assert.throws(()=>parseWidgetConfig({...config,widgets:config.widgets.map(w=>({...w,colors:{background:'url(x)',foreground:'#ffffff',highlight:'#ffffff'}}))}));
  const rendered = JSON.stringify(renderWidget(faq,config.accent));
  assert.ok(!rendered.includes('accordion'));
  assert.ok(rendered.includes(faq.entries[0].title));
  assert.ok(rendered.includes(faq.entries[0].text));
});
test("SDK renderiza por página y producto, oculta al vencer y solo consulta contenido público", async t => {
  const config=defaultWidgetConfig(); config.widgets[0].enabled=true;
  const faq=config.widgets.find(w=>w.kind==='faq')!; faq.enabled=true; faq.scope='products'; faq.productIds=[10];
  faq.slot='after_dynamic_section_main_product';
  const videos=config.widgets.find(w=>w.kind==='videos')!; videos.enabled=true; videos.scope='products'; videos.productIds=[10]; videos.slot='after_product_detail_shipping_options'; videos.entries=[{title:'',text:'',url:'https://cdn.example.com/a.mp4'}];
  const timer=config.widgets.find(w=>w.kind==='countdown')!; timer.enabled=true; timer.endsAt=new Date(Date.now()+100000).toISOString();
  let page:any={type:'product',data:{product:{id:10}}}; const renders=new Map(); const events:Record<string,Function>={}; const intervals:Function[]=[];
  t.mock.method(globalThis,'setInterval',(fn:Function)=>{intervals.push(fn);return 1;});
  t.mock.method(globalThis,'fetch',async(url:string, options:RequestInit)=>{assert.equal(url,'https://db.vidaeventofiesta.site/api/storefront/widgets?store=99'); assert.equal(options.credentials,'omit'); assert.equal(options.body,undefined);return Response.json(config);});
  const sdk:any={getState:()=>({store:{id:99},location:{page}}),on:(event:string,fn:Function)=>events[event]=fn,render:(slot:string,node:unknown)=>renders.set(slot,node),clearSlot:(slot:string)=>renders.delete(slot)};
  await App(sdk); assert.ok(renders.has('before_product_detail_name')); assert.ok(renders.has('after_dynamic_section_main_product')); assert.ok(renders.has('after_product_detail_shipping_options')); assert.ok(!renders.has('after_product_description'));
  assert.ok(JSON.stringify(renders.get('after_product_detail_shipping_options')).includes('store=99&product=10'));
  page={type:'product',data:{product:{id:20}}}; events['page:loaded'](); assert.ok(!renders.has('after_dynamic_section_main_product'));assert.ok(!renders.has('after_product_detail_shipping_options'));
  const pastEnd=Date.parse(timer.endsAt)+1000; t.mock.method(Date,'now',()=>pastEnd); intervals[0](); assert.ok(!renders.has('after_product_detail_price'));
  page={type:'home'}; events['page:loaded'](); assert.ok(!renders.has('after_product_detail_price'));
});
test("rutas de edición exigen administración y origen antes de consultar la base", async t => {
  const original = process.env.ADMIN_PASSWORD; process.env.ADMIN_PASSWORD='example-password-long';
  t.after(()=>{if(original===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=original;});
  assert.equal((await GET(new Request('https://db.vidaeventofiesta.site/api/tiendanube/widgets'))).status,401);
  assert.equal((await POST(new Request('https://db.vidaeventofiesta.site/api/tiendanube/widgets',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}))).status,403);
});


test("el contador repetitivo conserva el ciclo al recargar y pasa de cero al intervalo elegido",()=>{
  const w=defaultWidgetConfig().widgets.find(w=>w.kind==='countdown')!;w.enabled=true;w.repeatHours=10;w.endsAt='2026-10-16T10:00:00Z';
  const first=Date.parse(w.endsAt);assert.equal(countdownEnd(w,first-1000),w.endsAt);assert.equal(countdownEnd(w,first),'2026-10-16T20:00:00.000Z');
  assert.equal(countdownEnd(w,first+25*3600000),'2026-10-17T16:00:00.000Z');assert.equal(widgetApplies(w,undefined,first+25*3600000),true);
  assert.equal(countdownEnd(w,first+1000),countdownEnd(structuredClone(w),first+1000));
  const config=defaultWidgetConfig();config.widgets=config.widgets.map(v=>v.kind==='countdown'?w:v);assert.equal(parseWidgetConfig(config).widgets.find(v=>v.kind==='countdown')!.repeatHours,10);
  assert.throws(()=>parseWidgetConfig({...config,widgets:config.widgets.map(v=>v.kind==='countdown'?{...v,repeatHours:-10}:v)}));
});
