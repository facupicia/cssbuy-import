import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

export function createReportingSession(key: string, now = Date.now()) {
  const expires = String(now + 8 * 60 * 60 * 1000);
  return `${expires}.${createHmac("sha256", key).update(expires).digest("hex")}`;
}

function validSession(request: Request, key: string) {
  const cookie = request.headers.get("cookie")?.split(";").map(c => c.trim())
    .find(c => c.startsWith("reporting_session="))?.slice("reporting_session=".length);
  if (!cookie) return false;
  const [expires, signature, extra] = cookie.split(".");
  if (!expires || !signature || extra || !/^\d+$/.test(expires) || Number(expires) <= Date.now()
    || Number(expires) > Date.now() + 8 * 60 * 60 * 1000) return false;
  return secretMatches(signature, createHmac("sha256", key).update(expires).digest("hex"));
}

/** A separate read-only integration key, never the Meta token or a public env var. */
export function authorizeIntegration(request: Request): NextResponse | null {
  const key = process.env.BUSINESS_READ_API_KEY;
  if (!key || key.length < 32) {
    return NextResponse.json({ error: "Integración pendiente de configurar en el servidor." },
      { status: 503, headers: PRIVATE_HEADERS });
  }
  const supplied = request.headers.get("authorization") ?? "";
  if (!secretMatches(supplied, `Bearer ${key}`) && !validSession(request, key) && !storeAuthenticated(request)) {
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
