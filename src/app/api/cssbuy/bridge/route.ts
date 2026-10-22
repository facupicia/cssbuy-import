import { NextResponse } from "next/server";
import { storeGuard, readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { bridgeStatus, importBridge, parseBridgePayload } from "@/lib/cssbuy-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let running = false;
let lastImport = 0;
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try { return NextResponse.json(await bridgeStatus(), { headers: PRIVATE_HEADERS }); }
  catch { return NextResponse.json({ error: "No se pudo consultar la conexión CSSBuy" }, { status: 503, headers: PRIVATE_HEADERS }); }
}
export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let payload;
  try { payload = parseBridgePayload(await readStoreJson(request, 16 * 1024 * 1024)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Datos inválidos" }, { status: 400, headers: PRIVATE_HEADERS }); }
  if (running || Date.now() - lastImport < 10000) return NextResponse.json({ error: "Esperá unos segundos antes de volver a sincronizar" }, { status: 429, headers: PRIVATE_HEADERS });
  running = true; lastImport = Date.now();
  try { return NextResponse.json(await importBridge(payload), { headers: PRIVATE_HEADERS }); }
  catch { return NextResponse.json({ error: "No se pudieron guardar los datos de CSSBuy. Reintentá la sincronización." }, { status: 503, headers: PRIVATE_HEADERS }); }
  finally { running = false; }
}
