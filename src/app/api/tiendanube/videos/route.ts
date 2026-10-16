import { NextResponse } from "next/server";
import { storeGuard,readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { widgetStoreId } from "@/lib/store-widgets-db";
import { cancelUpload,startUpload,loadUpload,readChunk,putChunk,completeUpload,uploadStatus,CHUNK_BYTES } from "@/lib/store-video-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
let active=0,start=0,calls=0;
async function handle(request:Request) {
  const denied=storeGuard(request);if(denied)return denied;
  if(Date.now()-start>60000){start=Date.now();calls=0;}if(++calls>300||active>=3)return NextResponse.json({error:"Esperá un momento antes de continuar la subida"},{status:429,headers:{...PRIVATE_HEADERS,"Retry-After":"10"}});
  active++;
  try {
    const storeId=await widgetStoreId(),url=new URL(request.url),id=url.searchParams.get("upload");
    let result;
    if(!id&&request.method==="POST")result=await startUpload(await readStoreJson(request,2048),storeId);
    else if(id){const upload=await loadUpload(id,storeId);
      if(request.method==="PUT"){await putChunk(upload,Number(url.searchParams.get("part")),await readChunk(request,CHUNK_BYTES));result={ok:true};}
      else if(request.method==="POST"){await completeUpload(upload);result=uploadStatus(upload);}
      else if(request.method==="DELETE")result={cancelled:await cancelUpload(upload)};
      else result=uploadStatus(upload);
    }else throw new Error("Subida inválida");
    return NextResponse.json(result,{headers:PRIVATE_HEADERS});
  }catch(e){return NextResponse.json({error:(e as NodeJS.ErrnoException).code?"No se encontró la subida o no se pudo guardar el video":e instanceof Error?e.message:"No se pudo subir el video"},{status:400,headers:PRIVATE_HEADERS});}finally{active--;}
}
export const POST=handle,PUT=handle,GET=handle,DELETE=handle;
