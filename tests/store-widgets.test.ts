import test from "node:test";
import assert from "node:assert/strict";
import { defaultWidgetConfig, parseWidgetConfig, widgetApplies, countdownText, videoSource } from "../src/lib/store-widgets";
import { App, renderWidget } from "../storefront/main";
import { GET, POST } from "../src/app/api/tiendanube/widgets/route";
Object.defineProperty(globalThis, "self", { value: { __APP_DATA__: { id: "46841" } }, configurable: true });
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
  assert.ok(JSON.stringify(renderWidget(faq,config.accent)).includes('accordion'));
});
test("SDK renderiza por página y producto, oculta al vencer y solo consulta contenido público", async t => {
  const config=defaultWidgetConfig(); config.widgets[0].enabled=true;
  const faq=config.widgets.find(w=>w.kind==='faq')!; faq.enabled=true; faq.scope='products'; faq.productIds=[10];
  const timer=config.widgets.find(w=>w.kind==='countdown')!; timer.enabled=true; timer.endsAt=new Date(Date.now()+100000).toISOString();
  let page:any={type:'product',data:{product:{id:10}}}; const renders=new Map(); const events:Record<string,Function>={}; const intervals:Function[]=[];
  t.mock.method(globalThis,'setInterval',(fn:Function)=>{intervals.push(fn);return 1;});
  t.mock.method(globalThis,'fetch',async(url:string, options:RequestInit)=>{assert.equal(url,'https://db.vidaeventofiesta.site/api/storefront/widgets?store=99'); assert.equal(options.credentials,'omit'); assert.equal(options.body,undefined);return Response.json(config);});
  const sdk:any={getState:()=>({store:{id:99},location:{page}}),on:(event:string,fn:Function)=>events[event]=fn,render:(slot:string,node:unknown)=>renders.set(slot,node),clearSlot:(slot:string)=>renders.delete(slot)};
  await App(sdk); assert.ok(renders.has('after_header')); assert.ok(renders.has('after_product_description'));
  page={type:'product',data:{product:{id:20}}}; events['page:loaded'](); assert.ok(!renders.has('after_product_description'));
  const pastEnd=Date.parse(timer.endsAt)+1000; t.mock.method(Date,'now',()=>pastEnd); intervals[0](); assert.ok(!renders.has('after_product_detail_price'));
  page={type:'home'}; events['page:loaded'](); assert.ok(!renders.has('after_product_detail_price'));
});
test("rutas de edición exigen administración y origen antes de consultar la base", async t => {
  const original = process.env.ADMIN_PASSWORD; process.env.ADMIN_PASSWORD='example-password-long';
  t.after(()=>{if(original===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=original;});
  assert.equal((await GET(new Request('https://db.vidaeventofiesta.site/api/tiendanube/widgets'))).status,401);
  assert.equal((await POST(new Request('https://db.vidaeventofiesta.site/api/tiendanube/widgets',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}))).status,403);
});
