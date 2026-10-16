// Manual smoke test, run inside the deployed app container. Never publishes a widget.
import {execFileSync} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const root='/app/data/store-videos',temp=await fs.mkdtemp('/tmp/plug-video-smoke-');
let id;
try {
  const file=path.join(temp,'fixture.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=720x1280:rate=24','-t','2','-c:v','libx264','-preset','ultrafast','-crf','0','-pix_fmt','yuv420p','-threads','2',file],{timeout:30000});
  const bytes=await fs.readFile(file),expiry=Date.now()+600000,cookie='store_session='+expiry+'.'+createHmac('sha256',process.env.ADMIN_PASSWORD).update('store:'+expiry).digest('hex');
  const call=async(endpoint,method='GET',body,contentType='application/json')=>{const r=await fetch('http://127.0.0.1:3001'+endpoint,{method,headers:{Cookie:cookie,Origin:process.env.BUSINESS_APP_ORIGIN||'http://127.0.0.1:3001','Content-Type':contentType},...(body===undefined?{}:{body})});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
  const start=await call('/api/tiendanube/videos','POST',JSON.stringify({name:'PLUG test fixture.mp4',size:bytes.length}));id=start.id;
  for(let part=0;part<start.parts;part++)await call(`/api/tiendanube/videos?upload=${id}&part=${part}`,'PUT',bytes.subarray(part*start.chunkBytes,(part+1)*start.chunkBytes),'application/octet-stream');
  await call(`/api/tiendanube/videos?upload=${id}`,'POST');
  let result;const deadline=Date.now()+100000;
  do {await new Promise(r=>setTimeout(r,500));result=await call(`/api/tiendanube/videos?upload=${id}`);assert.notEqual(result.status,'failed',result.error);}while(result.status!=='ready'&&Date.now()<deadline);
  assert.equal(result.status,'ready');
  const range=await fetch(`http://127.0.0.1:3001/api/storefront/videos/${id}.mp4`,{headers:{Range:'bytes=0-63'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,64);
  const poster=await fetch(`http://127.0.0.1:3001/api/storefront/videos/${id}.jpg`);assert.equal(poster.status,200);assert.equal(poster.headers.get('content-type'),'image/jpeg');
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',path.join(root,id+'.mp4')],{encoding:'utf8'}));
  const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.codec_name,'h264');assert.equal(video.width,720);assert.equal(video.height,1280);
  console.log(JSON.stringify({ok:true,id,parts:start.parts,range:206,poster:200,width:video.width,height:video.height}));
} finally {
  await fs.rm(temp,{recursive:true,force:true});
  if(id&&!process.env.KEEP_VIDEO_FIXTURE){
    assert.match(id,/^[0-9a-f-]{36}$/);
    for(const ext of ['mp4','jpg','json'])await fs.unlink(path.join(root,id+'.'+ext)).catch(()=>{});
    await fs.rm(path.join(root,'.uploads',id),{recursive:true,force:true});
  }
}
