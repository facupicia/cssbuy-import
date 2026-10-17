import { NextResponse } from "next/server";
import { isReportingOrigin, PRIVATE_HEADERS, secretMatches } from "@/lib/integration-auth";
import { loginAllowed, readStoreJson, STORE_COOKIE, storeAuthenticated, storeSession } from "@/lib/store-auth";
import { hasStoreCredentials, loadStoreCredentials } from "@/lib/store-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const authenticated = storeAuthenticated(request);
  let connection = null;
  let configured = false;
  try {
    if (authenticated) { connection = await loadStoreCredentials(); configured = Boolean(connection); }
    else configured = await hasStoreCredentials();
  } catch { /* The private settings endpoint provides recovery guidance. */ }
  return NextResponse.json({ configured, authenticated,
    ...(authenticated && connection ? { storeId: connection.storeId } : {}),
    adminConfigured: (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12 }, { headers: PRIVATE_HEADERS });
}
export async function POST(request: Request) {
  if (!isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!loginAllowed()) return NextResponse.json({ error: "Esperá un minuto antes de volver a intentar" }, { status: 429, headers: { "Retry-After": "60" } });
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) return NextResponse.json({ error: "Configurá ADMIN_PASSWORD con al menos 12 caracteres en el servidor" }, { status: 503 });
  try {
    const body = await readStoreJson(request, 2048);
    if (typeof body.password !== "string" || !secretMatches(body.password, password)) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
    response.cookies.set(STORE_COOKIE, storeSession(password), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api", maxAge: 3600 });
    return response;
  } catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 }); }
}
export async function DELETE(request: Request) {
  if (!isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STORE_COOKIE, "", { path: "/api", maxAge: 0 });
  response.cookies.set("reporting_session", "", { path: "/api", maxAge: 0 });
  return response;
}
