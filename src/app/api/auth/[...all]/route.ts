import { NextResponse } from "next/server";
import { accessAttemptAllowed, authConfigured, ensureAuthSchema, getAuth } from "@/lib/auth";
import { isReportingOrigin, PRIVATE_HEADERS } from "@/lib/integration-auth";
import { readStoreJson } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowed = new Map([
  ["/get-session", "GET"], ["/sign-in/email", "POST"], ["/sign-out", "POST"],
  ["/list-sessions", "GET"], ["/revoke-session", "POST"],
  ["/revoke-other-sessions", "POST"], ["/change-password", "POST"],
]);

async function handle(request: Request) {
  const path = new URL(request.url).pathname.slice("/api/auth".length);
  if (allowed.get(path) !== request.method) return NextResponse.json({ error: "Ruta no disponible" }, { status: 404, headers: PRIVATE_HEADERS });
  if (request.method !== "GET" && !isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: PRIVATE_HEADERS });
  if (!authConfigured()) return NextResponse.json({ error: "Falta configurar el acceso en el servidor" }, { status: 503, headers: PRIVATE_HEADERS });
  try {
    await ensureAuthSchema();
    if (path === "/sign-in/email" && !await accessAttemptAllowed("login", 10)) return NextResponse.json({ error: "Esperá un minuto antes de volver a intentar" }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "60" } });
    if (request.method === "POST") {
      let body;
      try { body = await readStoreJson(request, 4096); }
      catch { return NextResponse.json({ error: "Solicitud inválida o demasiado grande" }, { status: 400, headers: PRIVATE_HEADERS }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: PRIVATE_HEADERS });
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.set("content-type", "application/json");
      request = new Request(request.url, { method: "POST", headers, body: JSON.stringify(body) });
    }
    const response = await getAuth().handler(request);
    response.headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo acceder a tu cuenta. Reintentá en unos instantes." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
export { handle as GET, handle as POST };
