import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { storeAuthenticated } from "./admin-session";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
let windowStart = 0;
let requests = 0;

export function isReportingOrigin(request: Request) {
  try {
    const expected = new URL(process.env.BUSINESS_APP_ORIGIN || request.url).origin;
    return request.headers.get("origin") === expected;
  } catch { return false; }
}

export function secretMatches(actual: string, expected: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(actual), hash(expected));
}

/** A separate read-only integration key, never the Meta token or a public env var. */
export async function authorizeIntegration(request: Request): Promise<NextResponse | null> {
  if (await storeAuthenticated(request)) return null;
  const key = process.env.BUSINESS_READ_API_KEY;
  if (!key || key.length < 32) {
    return NextResponse.json({ error: "Integración pendiente de configurar en el servidor." },
      { status: 503, headers: PRIVATE_HEADERS });
  }
  const supplied = request.headers.get("authorization") ?? "";
  if (!secretMatches(supplied, `Bearer ${key}`)) {
    return NextResponse.json({ error: "Acceso no autorizado." },
      { status: 401, headers: { ...PRIVATE_HEADERS, "WWW-Authenticate": "Bearer" } });
  }
  // Per-process bound for the single-business connector. Use a shared limiter
  // before running multiple replicas.
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
  if (++requests > 60) {
    return NextResponse.json({ error: "Demasiadas consultas. Reintentá en un minuto." },
      { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "60" } });
  }
  return null;
}
