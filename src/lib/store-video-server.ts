import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
export const VIDEO_ROOT=process.env.STORE_VIDEO_DIR ? path.resolve(/* turbopackIgnore: true */ process.env.STORE_VIDEO_DIR) : path.join(/* turbopackIgnore: true */ process.cwd(),"data","store-videos");
export const CHUNK_BYTES=768*1024, MAX_VIDEO_BYTES=100*1024*1024;
export const VIDEO_ORIGIN="https://db.vidaeventofiesta.site";
export const VIDEO_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Upload={id:string;storeId:string;name:string;size:number;parts:number;createdAt:number;status:"uploading"|"processing"|"ready"|"failed";error?:string};
const processing=new Set<string>();
export function videoPath(id:string,extension="mp4") { if(!VIDEO_ID.test(id)||!["mp4","jpg","json"].includes(extension))throw new Error("Video inválido");return path.join(/* turbopackIgnore: true */ VIDEO_ROOT,`${id}.${extension}`); }
function uploadDir(id:string) { if(!VIDEO_ID.test(id))throw new Error("Subida inválida");return path.join(/* turbopackIgnore: true */ VIDEO_ROOT,".uploads",id); }
async function save(u:Upload) { const target=path.join(uploadDir(u.id),"upload.json");const temp=target+".tmp";await fs.writeFile(temp,JSON.stringify(u));await fs.rename(temp,target); }
export async function loadUpload(id:string,storeId:string) {
  const u=JSON.parse(await fs.readFile(path.join(uploadDir(id),"upload.json"),"utf8")) as Upload;
  if(u.storeId!==storeId||Date.now()-u.createdAt>3600000)throw new Error("La subida venció. Volvé a seleccionar el archivo");
  if(u.status==="processing"&&!processing.has(id)&&Date.now()-u.createdAt>180000){u.status="failed";u.error="La preparación se interrumpió. Volvé a subir el video";await save(u);}return u;
}
export async function startUpload(input:Record<string,unknown>,storeId:string) {
  if(typeof input.name!=="string"||input.name.length>240||! /\.(mp4|mov|webm|m4v)$/i.test(input.name)||typeof input.size!=="number"||!Number.isSafeInteger(input.size)||input.size<32||input.size>MAX_VIDEO_BYTES)throw new Error("Elegí un video MP4, MOV o WebM de hasta 100 MB");
  await fs.mkdir(path.join(/* turbopackIgnore: true */ VIDEO_ROOT,".uploads"),{recursive:true});
  // Expired uploads are private staging files; final media is never removed here.
  const dirs=await fs.readdir(path.join(/* turbopackIgnore: true */ VIDEO_ROOT,".uploads"));let current=0;
  for(const id of dirs.filter(id=>VIDEO_ID.test(id))) {
    const dir=uploadDir(id),stat=await fs.stat(dir);
    if(Date.now()-stat.mtimeMs>3600000&&!processing.has(id))await fs.rm(dir,{recursive:true,force:true});
    else {try{const u=JSON.parse(await fs.readFile(path.join(dir,"upload.json"),"utf8")) as Upload;if(u.storeId===storeId&&["uploading","processing"].includes(u.status))current++;}catch{}}
  }
  if(current>=3)throw new Error("Hay tres subidas en curso. Esperá a que terminen o reintentá en una hora");
  const u:Upload={id:randomUUID(),storeId,name:input.name,size:input.size,parts:Math.ceil(input.size/CHUNK_BYTES),createdAt:Date.now(),status:"uploading"};
  await fs.mkdir(uploadDir(u.id));await save(u);return {id:u.id,chunkBytes:CHUNK_BYTES,parts:u.parts};
}
export async function readChunk(request:Request,max:number) {
  if(Number(request.headers.get("content-length")||0)>max)throw new Error("Fragmento demasiado grande");
  const reader=request.body?.getReader();if(!reader)throw new Error("Fragmento vacío");let size=0;const chunks:Uint8Array[]=[];
  while(true){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>max){await reader.cancel();throw new Error("Fragmento demasiado grande");}chunks.push(value.value);}return Buffer.concat(chunks);
}
export async function putChunk(u:Upload,part:number,bytes:Buffer) {
  if(u.status!=="uploading"||!Number.isInteger(part)||part<0||part>=u.parts||bytes.length!==Math.min(CHUNK_BYTES,u.size-part*CHUNK_BYTES))throw new Error("Fragmento inválido");
  const file=path.join(uploadDir(u.id),`part-${part}`);
  try{await fs.writeFile(file,bytes,{flag:"wx"});}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;if(!(await fs.readFile(file)).equals(bytes))throw new Error("El fragmento no coincide. Reiniciá la subida");}
}
export function runMedia(program:string,args:string[],timeout=120000):Promise<string> {
  return new Promise((resolve,reject)=>{const child=spawn(program,args,{shell:false,windowsHide:true});let output="";let ended=false;
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("El video tardó demasiado en procesarse. Probá con uno más corto"));},timeout);
    child.stdout.on("data",chunk=>{if(output.length<100000)output+=chunk.toString()});child.stderr.resume();
    child.on("error",()=>{clearTimeout(timer);if(!ended){ended=true;reject(new Error("No se pudo iniciar el procesador de videos"))}});
    child.on("close",code=>{clearTimeout(timer);if(!ended){ended=true;code===0?resolve(output):reject(new Error("No se pudo procesar el video. Probá exportarlo como MP4"))}});
  });
}
async function processUpload(u:Upload) {
  const source=path.join(uploadDir(u.id),"source"),output=path.join(uploadDir(u.id),"output.mp4");
  try {
    const handle=await fs.open(source,"w");
    try{for(let i=0;i<u.parts;i++){const bytes=await fs.readFile(path.join(uploadDir(u.id),`part-${i}`));if(bytes.length!==Math.min(CHUNK_BYTES,u.size-i*CHUNK_BYTES))throw new Error("La subida está incompleta");await handle.writeFile(bytes);}}finally{await handle.close();}
    const headerHandle=await fs.open(source,"r"),header=Buffer.alloc(12);try{await headerHandle.read(header,0,12,0);}finally{await headerHandle.close();}
    if(!["ftyp","moov","mdat","wide"].includes(header.toString("ascii",4,8))&&header.subarray(0,4).toString("hex")!=="1a45dfa3")throw new Error("El archivo no es un video MP4, MOV o WebM válido");
    const probe=JSON.parse(await runMedia(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-protocol_whitelist","file,pipe","-show_streams","-show_format","-of","json",source],15000));
    const video=probe.streams?.find((s:{codec_type:string})=>s.codec_type==="video");
    if(!video||!Number.isFinite(Number(probe.format?.duration))||Number(probe.format.duration)>180||Number(video.width)*Number(video.height)>3840*2160)throw new Error("Usá un video de hasta 3 minutos y resolución máxima 4K");
    await runMedia(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-nostdin","-y","-protocol_whitelist","file,pipe","-i",source,"-map","0:v:0","-map","0:a:0?","-vf","scale=w='min(1080,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1","-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart","-threads","2",output]);
    await runMedia(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-nostdin","-y","-i",output,"-frames:v","1","-vf","scale=360:-2",videoPath(u.id,"jpg")],15000);
    const size=(await fs.stat(output)).size;await fs.rename(output,videoPath(u.id));
    await fs.writeFile(videoPath(u.id,"json"),JSON.stringify({name:u.name,width:video.width,height:video.height,duration:Number(probe.format.duration),size}));
    u.status="ready";await save(u);
    for(const name of await fs.readdir(uploadDir(u.id)))if(name.startsWith("part-")||name==="source")await fs.unlink(path.join(uploadDir(u.id),name));
  } catch(e){u.status="failed";u.error=(e as Error).message;await save(u);}finally{processing.delete(u.id);}
}
export async function completeUpload(u:Upload) {
  if(u.status==="ready"||u.status==="processing")return;
  if(u.status!=="uploading")throw new Error(u.error||"La subida falló");
  if(processing.size>=1)throw new Error("Se está preparando otro video. Esperá un momento y reintentá");
  for(let i=0;i<u.parts;i++)if((await fs.stat(path.join(uploadDir(u.id),`part-${i}`))).size!==Math.min(CHUNK_BYTES,u.size-i*CHUNK_BYTES))throw new Error("La subida está incompleta");
  u.status="processing";await save(u);processing.add(u.id);void processUpload(u);
}
export function uploadStatus(u:Upload) {return {id:u.id,status:u.status,error:u.error,...(u.status==="ready"?{url:`${VIDEO_ORIGIN}/api/storefront/videos/${u.id}.mp4`,poster:`${VIDEO_ORIGIN}/api/storefront/videos/${u.id}.jpg`}: {})};}

export async function cancelUpload(u:Upload) {if(u.status==="processing"||u.status==="ready")return false;await fs.rm(uploadDir(u.id),{recursive:true,force:true});return true;}
