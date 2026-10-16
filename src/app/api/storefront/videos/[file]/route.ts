import { promises as fs,createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { videoPath,VIDEO_ID } from "@/lib/store-video-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{file:string}>}) {
  const {file}=await params;const match=/^([0-9a-f-]+)\.(mp4|jpg)$/.exec(file);
  if(!match||!VIDEO_ID.test(match[1]))return new Response(null,{status:404});
  try {
    const path=videoPath(match[1],match[2]),size=(await fs.stat(path)).size;
    const headers=new Headers({"Content-Type":match[2]==="mp4"?"video/mp4":"image/jpeg","Accept-Ranges":"bytes","Cache-Control":"public, max-age=31536000, immutable","Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff"});
    let start=0,end=size-1,status=200;const range=request.headers.get("range");
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});
      if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(size-1,Number(m[2]));}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});
      status=206;headers.set("Content-Range",`bytes ${start}-${end}/${size}`);
    }
    headers.set("Content-Length",String(end-start+1));
    return new Response(request.method==="HEAD"?null:Readable.toWeb(createReadStream(path,{start,end})) as ReadableStream,{status,headers});
  }catch{return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});}
}
export const HEAD=GET;
