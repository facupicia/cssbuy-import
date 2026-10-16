"use client";
import { useState,useRef } from "react";
import { Button } from "@/components/ui/Button";
type Result={id:string;status:string;url?:string;error?:string};
export function VideoUpload({onUploaded,onBusy,disabled=false}:{onUploaded:(url:string,name:string)=>void;onBusy:(value:boolean)=>void;disabled?:boolean}) {
  const [progress,setProgress]=useState<string>(""),[error,setError]=useState(""),[working,setWorking]=useState(false);const abort=useRef<AbortController|null>(null);
  async function upload(file:File) {
    if(!/\.(mp4|mov|webm|m4v)$/i.test(file.name)||file.size>100*1024*1024){setError("Elegí un video MP4, MOV o WebM de hasta 100 MB");return;}
    const controller=new AbortController();abort.current=controller;setWorking(true);onBusy(true);setError("");setProgress("Preparando subida…");
    const call=async<T,>(url:string,init?:RequestInit):Promise<T>=>{const r=await fetch(url,{...init,signal:controller.signal});const data=await r.json();if(!r.ok)throw new Error(data.error||"No se pudo subir el video");return data;};
    let uploadId="",finished=false;
    try {
      const start=await call<{id:string;chunkBytes:number;parts:number}>("/api/tiendanube/videos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,size:file.size})});
      uploadId=start.id;
      for(let part=0;part<start.parts;part++){
        const chunk=file.slice(part*start.chunkBytes,Math.min(file.size,(part+1)*start.chunkBytes));let failure:unknown;
        for(let retry=0;retry<3;retry++){try{await call(`/api/tiendanube/videos?upload=${start.id}&part=${part}`,{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:chunk});failure=null;break;}catch(e){failure=e;if(controller.signal.aborted)throw e;await new Promise(resolve=>setTimeout(resolve,500*(retry+1)));}}
        if(failure)throw failure;setProgress(`Subiendo video: ${Math.round((part+1)/start.parts*100)}%`);
      }
      setProgress("Preparando MP4 para tu tienda…");await call(`/api/tiendanube/videos?upload=${start.id}`,{method:"POST"});
      const deadline=Date.now()+180000;let result:Result;
      do {await new Promise(resolve=>setTimeout(resolve,1500));if(controller.signal.aborted)throw new DOMException("Cancelado","AbortError");result=await call<Result>(`/api/tiendanube/videos?upload=${start.id}`);if(result.status==="failed")throw new Error(result.error||"No se pudo procesar el video");}while(result.status!=="ready"&&Date.now()<deadline);
      if(!result.url)throw new Error("El video sigue procesándose. Reintentá en unos minutos");
      finished=true;onUploaded(result.url,file.name.replace(/\.[^.]+$/,""));setProgress("Video listo. Guardá el borrador o publicá la versión para usarlo en la tienda.");
    }catch(e){if((e as Error).name==="AbortError")setProgress("Subida cancelada");else{setError((e as Error).message);setProgress("");}}finally{if(uploadId&&!finished)void fetch(`/api/tiendanube/videos?upload=${uploadId}`,{method:"DELETE"}).catch(()=>{});setWorking(false);onBusy(false);abort.current=null;}
  }
  return <div className="space-y-3 rounded-lg bg-[var(--color-bg-subtle)] p-4"><label className="block text-sm font-medium space-y-2"><span>Subir video desde tu equipo</span><input aria-label="Subir video desde tu equipo" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-[var(--color-border)] file:p-2 file:bg-[var(--color-bg-elevated)]" type="file" accept="video/mp4,video/quicktime,video/webm,.m4v" disabled={working||disabled} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value="";}}/></label><p className="text-xs text-[var(--color-fg-muted)]">Hasta 100 MB y 3 minutos. Se prepara como MP4 sin estirar la imagen. La reproducción automática comienza sin sonido.</p>{progress&&<p role="status" className="text-sm">{progress}</p>}{error&&<p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}{working&&<Button size="sm" onClick={()=>abort.current?.abort()}>Cancelar subida</Button>}</div>;
}
