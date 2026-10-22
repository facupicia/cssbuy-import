import { NextResponse } from "next/server";
import { accessAttemptAllowed, authConfigured, createAuth, ensureAuthSchema, getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { isReportingOrigin, PRIVATE_HEADERS, secretMatches } from "@/lib/integration-auth";
import { readStoreJson } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { ...PRIVATE_HEADERS, ...(status === 429 ? { "Retry-After": "60" } : {}) } });

export async function POST(request: Request) {
  if (!isReportingOrigin(request)) return reply("Origen no permitido", 403);
  const setupKey = process.env.ADMIN_PASSWORD;
  if (!authConfigured() || !setupKey || setupKey.length < 12) return reply("Falta configurar la clave inicial en el servidor", 503);
  let body: Record<string, unknown>;
  try { body = await readStoreJson(request, 4096); }
  catch { return reply("Revisá los datos del formulario", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Revisá los datos del formulario", 400);
  const { email, password, name, adminPassword } = body;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" || password.length < 12 || password.length > 128 ||
      typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
      typeof adminPassword !== "string" || adminPassword.length > 512 ||
      typeof body.rememberMe !== "boolean") return reply("Completá tu nombre, email y una contraseña de 12 a 128 caracteres", 400);
  try {
    await ensureAuthSchema();
    if (!await accessAttemptAllowed("bootstrap", 5)) return reply("Esperá un minuto antes de volver a intentar", 429);
    if (!secretMatches(adminPassword, setupKey)) return reply("La clave de administración actual es incorrecta", 401);
    if (secretMatches(password, setupKey)) return reply("Elegí una contraseña personal diferente de la clave de administración", 400);
    const client = await getPool().connect();
    let locked = false;
    try {
      // Never occupy the whole connection pool with waiters during bootstrap.
      const lock = await client.query("SELECT pg_try_advisory_lock(73428002) AS locked");
      locked = lock.rows[0].locked;
      if (!locked) return reply("Se está creando la cuenta inicial. En unos segundos, iniciá sesión con tu email.", 409);
      const existing = await client.query("SELECT 1 FROM plug_user LIMIT 1");
      if (existing.rows.length) return reply("La cuenta inicial ya fue creada. Iniciá sesión con tu email.", 409);
      // This sign-up instance is server-only and never handles public requests.
      await createAuth(true).api.signUpEmail({ body: { email: email.trim().toLowerCase(), password, name: name.trim() } });
    } finally {
      try { if (locked) await client.query("SELECT pg_advisory_unlock(73428002)"); }
      finally { client.release(); }
    }
    const response = await getAuth().api.signInEmail({ body: { email: email.trim().toLowerCase(), password, rememberMe: body.rememberMe }, headers: request.headers, asResponse: true });
    response.headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
    return response;
  } catch {
    return reply("No se pudo completar el acceso. Si ya creaste tu cuenta, intentá iniciar sesión con tu email.", 503);
  }
}
