import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const widgets=['alert','faq','payments','videos','countdown'].map(kind=>({kind,enabled:false,title:({alert:'Mensaje de alerta',faq:'Preguntas frecuentes',payments:'Medios de pago',videos:'Slider de videos',countdown:'Cuenta regresiva'})[kind],text:kind==='alert'?'10% de descuento pagando por transferencia.':'',slot:kind==='alert'?'after_header':'after_product_description',scope:'all',productIds:[],endsAt:'',entries:kind==='faq'?[{title:'¿Cómo elijo mi talle?',text:'Consultá la tabla de talles del producto.',url:''}]:[]}));
const browser=await chromium.launch({headless:true});
try { for(const width of [1365,390]) {
  const page=await browser.newPage({viewport:{width,height:950}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let data={storeId:'99',version:0,draft:{accent:'#181818',widgets:structuredClone(widgets)},published:null,publishedAt:null,installation:{status:'active',scriptId:11413,version:2}}; let saves=0; let conflict=false;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname; const ok=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
    if(path==='/api/tiendanube/videos') {
      const u=new URL(route.request().url());
      if(!u.searchParams.has('upload'))return ok({id:'11111111-1111-4111-8111-111111111111',chunkBytes:786432,parts:1});
      if(route.request().method()==='GET')return ok({id:'11111111-1111-4111-8111-111111111111',status:'ready',url:'https://db.vidaeventofiesta.site/api/storefront/videos/11111111-1111-4111-8111-111111111111.mp4'});
      return ok({status:'processing'});
    }
    if(path==='/api/tiendanube/session')return ok({authenticated:true});
    if(path==='/api/tiendanube/catalog')return ok({storeId:'99',products:[{id:10,name:'Remera Bape'}],hasMore:false});
    if(path==='/api/tiendanube/widgets'){
      if(route.request().method()==='POST'){
        const body=route.request().postDataJSON();assert.equal(body.version,data.version);saves++;
        if(conflict)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Otra pestaña modificó los bloques.'})});
        data={...data,draft:body.config,version:data.version+1,...(body.publish?{published:body.config,publishedAt:new Date().toISOString()}: {})};
      }return ok(data);
    }return ok({});
  });
  await page.goto('http://localhost:3001/tienda');
  await page.getByRole('heading',{name:'Personalizar tienda',exact:true}).waitFor();
  await page.getByText('Script activo en Tiendanube · versión 2',{exact:true}).waitFor();
  await page.getByLabel('Mostrar bloque',{exact:true}).check();
  assert.equal(await page.getByLabel('Ubicación',{exact:true}).inputValue(), 'before_product_detail_name');
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Borrador guardado'}).waitFor(); assert.equal(data.published,null);
  await page.getByRole('button',{name:'Preguntas frecuentes Apagado',exact:true}).click();
  await page.getByLabel('Mostrar bloque',{exact:true}).check();
  await page.getByLabel('Mostrar en',{exact:true}).selectOption('products');
  await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await page.getByLabel('Remera Bape',{exact:true}).check();
  await page.getByRole('button',{name:'Publicar versión',exact:true}).click();
  assert.equal(saves,1);
  await page.getByRole('button',{name:'Confirmar publicación',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Versión publicada guardada'}).waitFor();
  assert.deepEqual(data.published.widgets.find(w=>w.kind==='faq').productIds,[10]);
  await page.getByText('¿Cómo elijo mi talle?',{exact:true}).click();
  await page.getByText('Consultá la tabla de talles del producto.',{exact:true}).last().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`.impeccable/review/store-widgets-${width}.png`,fullPage:true});
  await page.getByRole('region',{name:'Vista previa del bloque'}).screenshot({path:`.impeccable/review/reference-faq-${width}.png`});
  conflict=true;await page.getByLabel('Título',{exact:true}).fill('Preguntas PLUG');
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('alert').filter({hasText:'Otra pestaña'}).waitFor();
  assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Preguntas PLUG');
  assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Mensaje de alerta Activo',exact:true}).click();
  await page.getByRole('region',{name:'Vista previa del bloque'}).screenshot({path:`.impeccable/review/reference-alert-${width}.png`});
  await page.getByLabel('Color de fondo',{exact:true}).fill('#dc2626');
  await page.getByRole('button',{name:'Usar diseño de referencia',exact:true}).click();
  assert.equal(await page.getByLabel('Color de fondo',{exact:true}).inputValue(),'#ef4444');
  await page.getByRole('button',{name:'Slider de videos Apagado',exact:true}).click();
  for(let i=0;i<3;i++) {
    await page.getByRole('button',{name:'Agregar video',exact:true}).click();
    await page.locator(`#entry-title-${i}`).fill(`Video ${i+1}`);
    await page.locator(`#entry-url-${i}`).fill(`https://cdn.example.com/${i+1}.mp4`);
  }
  await page.getByRole('button',{name:'Video siguiente',exact:true}).click();
  const videoPreview=page.getByRole('region',{name:'Vista previa del bloque'});
  assert.equal(await videoPreview.locator('video').nth(1).getAttribute('src'),'https://cdn.example.com/2.mp4');
  const heights=await videoPreview.locator('video').evaluateAll(elements=>elements.map(e=>e.parentElement.getBoundingClientRect().height));
  assert.ok(Math.max(...heights)<=321,'Los videos conservan una altura acotada');
  assert.ok(Math.max(...heights)-Math.min(...heights)<1,'Todas las tarjetas tienen la misma altura');
  assert.equal(await videoPreview.locator('video[controls]').count(),0);
  assert.equal(await videoPreview.getByText('Video 1',{exact:true}).count(),0);
  assert.equal(await videoPreview.locator('video').first().evaluate(e=>getComputedStyle(e).objectFit),'contain');
  await videoPreview.screenshot({path:`.impeccable/review/reference-videos-${width}.png`});
  await page.getByLabel('Subir video desde tu equipo',{exact:true}).setInputFiles({name:'Remera propia.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(100)});
  await page.getByRole('status').filter({hasText:'Video listo.'}).waitFor();
  assert.equal(await page.locator('#entry-title-3').inputValue(),'Remera propia');
  assert.match(await page.locator('#entry-url-3').inputValue(),/11111111-1111-4111-8111-111111111111/);
  await page.getByRole('button',{name:'Cuenta regresiva Apagado',exact:true}).click();
  await page.getByLabel('Repetir la cuenta automáticamente',{exact:true}).check();
  assert.equal(await page.getByLabel('Duración de cada ciclo (horas)',{exact:true}).inputValue(),'10');
  await page.getByRole('region',{name:'Vista previa del bloque'}).screenshot({path:`.impeccable/review/reference-loop-${width}.png`});
  await page.close();
} } finally {await browser.close();}
console.log('Widgets: borrador/publicación, selección, FAQ, conflicto y escritorio/móvil correctos');
