import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("subida acotada, partes idempotentes, aislamiento de tienda y rangos públicos",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"plug-video-test-"));process.env.STORE_VIDEO_DIR=root;
  const v=await import("../src/lib/store-video-server");const route=await import("../src/app/api/storefront/videos/[file]/route");
  try{
    await assert.rejects(v.startUpload({name:"x.html",size:80},"1"));await assert.rejects(v.startUpload({name:"x.mp4",size:101*1024*1024},"1"));
    const start=await v.startUpload({name:"video.mp4",size:100},"1"),u=await v.loadUpload(start.id,"1");
    await assert.rejects(v.loadUpload(start.id,"2"));assert.throws(()=>v.videoPath('../x'));
    await assert.rejects(v.putChunk(u,0,Buffer.alloc(99)));await v.putChunk(u,0,Buffer.alloc(100,1));await v.putChunk(u,0,Buffer.alloc(100,1));await assert.rejects(v.putChunk(u,0,Buffer.alloc(100,2)));
    await assert.rejects(v.readChunk(new Request('https://app',{method:'PUT',body:Buffer.alloc(20)}),10));
    const bytes=Buffer.from('0123456789');await writeFile(v.videoPath(start.id),bytes);
    const params=Promise.resolve({file:start.id+'.mp4'});
    const r=await route.GET(new Request('https://app',{headers:{Range:'bytes=2-5'}}),{params});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await r.text(),'2345');
    const suffix=await route.GET(new Request('https://app',{headers:{Range:'bytes=-3'}}),{params});assert.equal(await suffix.text(),'789');
    assert.equal((await route.GET(new Request('https://app',{headers:{Range:'bytes=99-100'}}),{params})).status,416);
    assert.equal((await route.GET(new Request('https://app'),{params:Promise.resolve({file:'../../.env'})})).status,404);
    const head=await route.HEAD(new Request('https://app',{method:'HEAD'}),{params});assert.equal(head.headers.get('Content-Length'),'10');assert.equal(await head.text(),'');
    await v.cancelUpload(u);await assert.rejects(v.loadUpload(start.id,'1'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test("la subida exige administración y origen válido",async()=>{
  const api=await import('../src/app/api/tiendanube/videos/route');const prior=process.env.ADMIN_PASSWORD;process.env.ADMIN_PASSWORD='test-admin-password';
  try{assert.equal((await api.POST(new Request('https://db.vidaeventofiesta.site/api/tiendanube/videos',{method:'POST',headers:{Origin:'https://evil.example'}}))).status,403);assert.equal((await api.GET(new Request('https://db.vidaeventofiesta.site/api/tiendanube/videos'))).status,401);}finally{if(prior===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=prior;}
});
