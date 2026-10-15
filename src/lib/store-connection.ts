import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { getPool, isPgConfigured } from "./db";

export interface StoreCredentials {
  storeId: string; token: string; userAgent: string; locationId?: string;
  storeName?: string; verifiedAt?: string; source: "environment" | "panel";
}
export interface StoreOAuthApp { clientId: string; clientSecret: string; shopUrl: string; contactEmail: string }
export class StoreConnectionLockedError extends Error {}
let schema: Promise<void> | null = null;
export async function ensureStoreConnectionTable() {
  if (!schema) schema = getPool().query(`CREATE TABLE IF NOT EXISTS tiendanube_connection (
    id SMALLINT PRIMARY KEY CHECK (id = 1), secret TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS tiendanube_oauth_app (
      id SMALLINT PRIMARY KEY CHECK (id = 1), secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tiendanube_oauth_states (
      hash TEXT PRIMARY KEY, app_version TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)
    `).then(() => undefined).catch(e => { schema = null; throw e; });
  return schema;
}

function adminSecret() {
  const key = process.env.ADMIN_PASSWORD;
  if (!key || key.length < 12) throw new Error("Configurá la contraseña de administración antes de conectar la tienda");
  return key;
}
export function encryptStoreCredentials(credentials: StoreCredentials | StoreOAuthApp, password = adminSecret(), context = "connection") {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  cipher.setAAD(Buffer.from(`PLUG:tiendanube:${context}:v1`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return ["v1", salt.toString("base64"), iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
export function decryptStoreCredentials<T = StoreCredentials>(value: string, password = adminSecret(), context = "connection"): T {
  try {
    const [version, salt, iv, tag, encrypted, extra] = value.split(".");
    if (version !== "v1" || !salt || !iv || !tag || !encrypted || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, Buffer.from(salt, "base64"), 32), Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(`PLUG:tiendanube:${context}:v1`));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new StoreConnectionLockedError("No se pudo abrir la conexión guardada. Si cambiaste la contraseña de administración, volvé a configurar la app y autorizar la tienda"); }
}
export function environmentStoreCredentials(): StoreCredentials | null {
  const storeId = process.env.TIENDANUBE_STORE_ID;
  const token = process.env.TIENDANUBE_ACCESS_TOKEN;
  const userAgent = process.env.TIENDANUBE_USER_AGENT;
  return storeId && /^\d+$/.test(storeId) && token && userAgent
    ? { storeId, token, userAgent, locationId: process.env.TIENDANUBE_LOCATION_ID, source: "environment" } : null;
}
export async function loadStoreCredentials(): Promise<StoreCredentials | null> {
  const environment = environmentStoreCredentials();
  if (environment) return environment;
  if (!isPgConfigured()) return null;
  await ensureStoreConnectionTable();
  const result = await getPool().query("SELECT secret FROM tiendanube_connection WHERE id=1");
  return result.rows[0] ? decryptStoreCredentials(result.rows[0].secret) : null;
}
export async function hasStoreCredentials() {
  if (environmentStoreCredentials()) return true;
  if (!isPgConfigured()) return false;
  await ensureStoreConnectionTable();
  return (await getPool().query("SELECT id FROM tiendanube_connection WHERE id=1")).rows.length > 0;
}
export async function saveStoreCredentials(value: StoreCredentials) {
  if (environmentStoreCredentials()) throw new Error("Esta conexión se administra desde las variables del servidor");
  const secret = encryptStoreCredentials(value);
  await ensureStoreConnectionTable();
  await getPool().query(`INSERT INTO tiendanube_connection (id, secret) VALUES (1,$1)
    ON CONFLICT (id) DO UPDATE SET secret=EXCLUDED.secret, updated_at=now()`, [secret]);
}
export async function deleteStoreCredentials() {
  if (environmentStoreCredentials()) throw new Error("Esta conexión se administra desde las variables del servidor");
  await ensureStoreConnectionTable();
  await getPool().query("DELETE FROM tiendanube_connection WHERE id=1");
  await getPool().query("DELETE FROM tiendanube_oauth_states");
}
export function publicStoreConnection(value: StoreCredentials | null) {
  return value ? { storeId: value.storeId, storeName: value.storeName ?? "Tiendanube", locationId: value.locationId ?? "",
    verifiedAt: value.verifiedAt ?? null, source: value.source } : null;
}
export async function loadStoreOAuthApp(): Promise<StoreOAuthApp | null> {
  if (!isPgConfigured()) return null;
  await ensureStoreConnectionTable();
  const result = await getPool().query("SELECT secret FROM tiendanube_oauth_app WHERE id=1");
  return result.rows[0] ? decryptStoreCredentials<StoreOAuthApp>(result.rows[0].secret, adminSecret(), "oauth-app") : null;
}
export async function saveStoreOAuthApp(value: StoreOAuthApp) {
  if (environmentStoreCredentials()) throw new Error("La conexión actual se administra desde el servidor");
  const secret = encryptStoreCredentials(value, adminSecret(), "oauth-app");
  await ensureStoreConnectionTable();
  await getPool().query("INSERT INTO tiendanube_oauth_app (id,secret) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET secret=EXCLUDED.secret", [secret]);
}
