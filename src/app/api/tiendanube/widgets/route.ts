import { NextResponse } from "next/server";
import { storeGuard, readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { parseWidgetConfig } from "@/lib/store-widgets";
import { readWidgets, widgetStoreId, writeWidgets } from "@/lib/store-widgets-db";
import { storeRequest } from "@/lib/tiendanube-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try {
    const config = await readWidgets(await widgetStoreId());
    let installation: { status: string; scriptId?: number; version?: number } = { status: "unavailable" };
    try {
      const response = await storeRequest<{ result: { id: number; name: string; status: string; current_version?: { version: number; src: string } }[] }>("/scripts");
      const script = response.result.find(s => s.name === "PLUG Personalizar tienda" || s.current_version?.src.includes("/plug-storefront/"));
      installation = script ? { status: script.status, scriptId: script.id, version: script.current_version?.version } : { status: "missing" };
    } catch { /* Product integration may still work without permission to inspect scripts. */ }
    return NextResponse.json({ ...config, installation }, { headers: PRIVATE_HEADERS });
  }
  catch { return NextResponse.json({ error: "No se pudo cargar la configuración. Verificá la conexión con Tiendanube y reintentá" }, { status: 503, headers: PRIVATE_HEADERS }); }
}
export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let body; let config;
  try {
    body = await readStoreJson(request, 300 * 1024);
    if (!Number.isSafeInteger(body.version) || Number(body.version) < 0 || typeof body.publish !== "boolean" || typeof body.storeId !== "string") throw new Error("Solicitud inválida");
    config = parseWidgetConfig(body.config);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Configuración inválida" }, { status: 400, headers: PRIVATE_HEADERS }); }
  try {
    const storeId = await widgetStoreId();
    if (body.storeId !== storeId) return NextResponse.json({ error: "Cambió la tienda conectada. Recargá antes de guardar" }, { status: 409, headers: PRIVATE_HEADERS });
    const result = await writeWidgets(storeId, Number(body.version), config, Boolean(body.publish));
    return result ? NextResponse.json(result, { headers: PRIVATE_HEADERS }) : NextResponse.json({ error: "Otra pestaña modificó los bloques. Recargá para revisar la última versión" }, { status: 409, headers: PRIVATE_HEADERS });
  } catch { return NextResponse.json({ error: "No se pudo guardar. Tu edición sigue en pantalla; reintentá" }, { status: 503, headers: PRIVATE_HEADERS }); }
}
