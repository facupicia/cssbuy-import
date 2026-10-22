import { storeGuard } from "@/lib/store-auth";
import { NextResponse } from "next/server";
import { isReportingOrigin, PRIVATE_HEADERS } from "@/lib/integration-auth";
import { readStoreJson } from "@/lib/store-auth";
import { downloadPhoto, normalizePhotoBuffer, photoSourceUrl } from "@/lib/normalize-photo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let start = 0;
let requests = 0;
let active = 0;

export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  if (!isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: PRIVATE_HEADERS });
  if (Date.now() - start >= 60000) { start = Date.now(); requests = 0; }
  if (++requests > 30 || active >= 2) return NextResponse.json({ error: "Esperá un minuto antes de procesar más fotos" }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "60" } });
  let url: URL;
  try { url = photoSourceUrl((await readStoreJson(request, 4096)).url); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Enlace inválido" }, { status: 400, headers: PRIVATE_HEADERS }); }
  active++;
  try {
    const result = await normalizePhotoBuffer(await downloadPhoto(url.href));
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "No se pudo abrir esa foto. Verificá que el enlace sea público y directo a un JPG, PNG o WebP de hasta 12 MB, o subila desde tu equipo" }, { status: 422, headers: PRIVATE_HEADERS });
  } finally { active--; }
}
