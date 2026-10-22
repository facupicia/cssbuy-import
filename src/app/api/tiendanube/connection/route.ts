import { NextResponse } from "next/server";
import { storeGuard, readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { loadStoreCredentials, loadStoreOAuthApp, publicStoreConnection, saveStoreOAuthApp, deleteStoreCredentials, saveStoreCredentials, StoreConnectionLockedError } from "@/lib/store-connection";
import { CALLBACK_PATH, panelOrigin, parseOAuthApp, verifyStoreConnection } from "@/lib/store-oauth";
import { StoreApiError } from "@/lib/tiendanube-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof StoreApiError ? error.message : "No se pudo acceder a la conexión. Revisá la configuración o volvé a conectar si cambiaste la contraseña de administración" }, { status: error instanceof StoreApiError ? error.status : 503, headers: PRIVATE_HEADERS });
}
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try {
    let warning: string | undefined;
    const recover = (e: unknown) => { if (e instanceof StoreConnectionLockedError) { warning = e.message; return null; } throw e; };
    const [connection, app] = await Promise.all([loadStoreCredentials().catch(recover), loadStoreOAuthApp().catch(recover)]);
    return NextResponse.json({ connection: publicStoreConnection(connection), app: app ? { clientId: app.clientId, shopUrl: app.shopUrl, contactEmail: app.contactEmail } : null,
      callbackUrl: panelOrigin(request) + CALLBACK_PATH, warning }, { headers: PRIVATE_HEADERS });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let app;
  try { app = parseOAuthApp(await readStoreJson(request)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Datos de la app inválidos" }, { status: 400, headers: PRIVATE_HEADERS }); }
  try { await saveStoreOAuthApp(app); return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS }); }
  catch (e) { return errorResponse(e); }
}
export async function PATCH(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try {
    const connection = await loadStoreCredentials();
    if (!connection) return NextResponse.json({ error: "Todavía no hay una tienda conectada" }, { status: 409, headers: PRIVATE_HEADERS });
    const verified = await verifyStoreConnection(connection);
    if (verified.source === "panel") await saveStoreCredentials(verified);
    return NextResponse.json({ connection: publicStoreConnection(verified) }, { headers: PRIVATE_HEADERS });
  } catch(e) { return errorResponse(e); }
}
export async function DELETE(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try { await deleteStoreCredentials(); return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS }); }
  catch(e) { return errorResponse(e); }
}
