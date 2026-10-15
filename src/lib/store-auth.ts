import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { isReportingOrigin, PRIVATE_HEADERS, secretMatches } from "./integration-auth";

export const STORE_COOKIE = "store_session";
let attempts = 0;
let start = 0;
export function storeSession(password: string, expires = Date.now() + 3_600_000) {
  return `${expires}.${createHmac("sha256", password).update(`store:${expires}`).digest("hex")}`;
}
export function storeAuthenticated(request: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) return false;
  const cookie = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${STORE_COOKIE}=`))?.slice(STORE_COOKIE.length + 1);
  if (!cookie) return false;
  const [expiry] = cookie.split(".");
  const expires = Number(expiry);
  return /^\d+$/.test(expiry) && expires > Date.now() && expires <= Date.now() + 3_600_000
    && secretMatches(cookie, storeSession(password, expires));
}
export function storeGuard(request: Request) {
  if (request.method !== "GET" && !isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: PRIVATE_HEADERS });
  if (!storeAuthenticated(request)) return NextResponse.json({ error: "Ingresá la contraseña de administración para continuar" }, { status: 401, headers: PRIVATE_HEADERS });
  return null;
}
export function loginAllowed() {
  if (Date.now() - start > 60_000) { start = Date.now(); attempts = 0; }
  return ++attempts <= 10;
}

export async function readStoreJson(request: Request, max = 8192) {
  if (Number(request.headers.get("content-length") || 0) > max) throw new Error("Solicitud demasiado grande");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Solicitud vacía");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > max) { await reader.cancel(); throw new Error("Solicitud demasiado grande"); }
    parts.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as Record<string, unknown>;
}
