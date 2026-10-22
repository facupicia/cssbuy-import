import { NextResponse } from "next/server";
import { storeGuard } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { environmentStoreCredentials, loadStoreOAuthApp } from "@/lib/store-connection";
import { beginStoreOAuth, OAUTH_COOKIE } from "@/lib/store-oauth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try {
    if (environmentStoreCredentials()) return NextResponse.json({ error: "La conexión se administra desde el servidor" }, { status: 409 });
    const app = await loadStoreOAuthApp();
    if (!app) return NextResponse.json({ error: "Guardá primero el ID y la clave de tu aplicación privada" }, { status: 409 });
    const result = await beginStoreOAuth(app);
    const response = NextResponse.json({ url: result.url }, { headers: PRIVATE_HEADERS });
    response.cookies.set(OAUTH_COOKIE, result.state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/tiendanube/oauth", maxAge: 600 });
    return response;
  } catch { return NextResponse.json({ error: "No se pudo iniciar la autorización. Revisá la configuración de la app" }, { status: 503, headers: PRIVATE_HEADERS }); }
}
