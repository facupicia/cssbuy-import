import { NextResponse } from "next/server";
import { createReportingSession, isReportingOrigin, PRIVATE_HEADERS, secretMatches } from "@/lib/integration-auth";

export const runtime = "nodejs";
let attempts = 0;
let windowStart = 0;

export async function POST(request: Request) {
  if (!isReportingOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403, headers: PRIVATE_HEADERS });
  }
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); attempts = 0; }
  if (++attempts > 10) {
    return NextResponse.json({ error: "Esperá un minuto antes de volver a intentar." },
      { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "60" } });
  }
  const key = process.env.BUSINESS_READ_API_KEY;
  const password = process.env.ADMIN_PASSWORD;
  if (!key || key.length < 32 || !password || password.length < 12) {
    return NextResponse.json({ error: "Configurá BUSINESS_READ_API_KEY y ADMIN_PASSWORD (mínimo 12 caracteres) en el servidor." },
      { status: 503, headers: PRIVATE_HEADERS });
  }
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) throw new Error("size");
    const body = await request.json();
    if (typeof body.password !== "string" || body.password.length > 512
      || !secretMatches(body.password, password)) {
      return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401, headers: PRIVATE_HEADERS });
    }
    const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
    response.cookies.set("reporting_session", createReportingSession(key), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
      path: "/api", maxAge: 8 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400, headers: PRIVATE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  if (!isReportingOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403, headers: PRIVATE_HEADERS });
  }
  const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  response.cookies.set("reporting_session", "", { path: "/api", maxAge: 0 });
  return response;
}
