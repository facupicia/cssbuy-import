import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const widgets=['alert','faq','payments','videos','countdown'].map(kind=>({kind,enabled:false,title:({alert:'Mensaje de alerta',faq:'Preguntas frecuentes',payments:'Medios de pago',videos:'Slider de videos',countdown:'Cuenta regresiva'})[kind],text:kind==='alert'?'10% de descuento pagando por transferencia.':'',slot:kind==='alert'?'after_header':'after_product_description',scope:'all',productIds:[],endsAt:'',entries:kind==='faq'?[{title:'¿Cómo elijo mi talle?',text:'Consultá la tabla de talles del producto.',url:''}]:[]}));
const browser=await chromium.launch({headless:true});
try { for(const width of [1365,390]) {
  const page=await browser.newPage({viewport:{width,height:950}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let data={storeId:'99',version:0,draft:{accent:'#181818',widgets:structuredClone(widgets)},published:null,publishedAt:null}; let saves=0; let conflict=false;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname; const ok=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
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
  await page.getByLabel('Mostrar bloque',{exact:true}).check();
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
  conflict=true;await page.getByLabel('Título',{exact:true}).fill('Preguntas PLUG');
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('alert').filter({hasText:'Otra pestaña'}).waitFor();
  assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Preguntas PLUG');
  assert.deepEqual(errors,[]);await page.close();
} } finally {await browser.close();}
console.log('Widgets: borrador/publicación, selección, FAQ, conflicto y escritorio/móvil correctos');
