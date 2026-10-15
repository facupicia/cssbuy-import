import { createHash, randomBytes } from "node:crypto";
import { getPool } from "./db";
import { ensureStoreConnectionTable, loadStoreOAuthApp, saveStoreCredentials, type StoreCredentials, type StoreOAuthApp } from "./store-connection";
import { StoreApiError, storeRequest } from "./tiendanube-api";
import { secretMatches } from "./integration-auth";

export const OAUTH_COOKIE = "tiendanube_oauth_state";
export const CALLBACK_PATH = "/api/tiendanube/oauth/callback";
export function panelOrigin(request: Request) {
  const url = new URL(process.env.BUSINESS_APP_ORIGIN || request.url);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Configurá el dominio HTTPS del panel en el servidor");
  return url.origin;
}
export function parseOAuthApp(body: Record<string, unknown>): StoreOAuthApp {
  if (typeof body.clientId !== "string" || !/^\d{1,18}$/.test(body.clientId)) throw new Error("Ingresá el ID numérico de la aplicación");
  if (typeof body.clientSecret !== "string" || !/^[\x21-\x7e]{12,2048}$/.test(body.clientSecret)) throw new Error("Ingresá la clave secreta de la aplicación");
  if (typeof body.contactEmail !== "string" || body.contactEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) throw new Error("Ingresá un correo de contacto válido");
  const url = new URL(String(body.shopUrl));
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) throw new Error("Ingresá el dominio HTTPS de tu tienda");
  return { clientId: body.clientId, clientSecret: body.clientSecret, shopUrl: url.origin, contactEmail: body.contactEmail.trim() };
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function appVersion(app: StoreOAuthApp) { return hash(JSON.stringify(app)); }
export async function beginStoreOAuth(app: StoreOAuthApp) {
  await ensureStoreConnectionTable();
  const state = randomBytes(32).toString("hex");
  await getPool().query("DELETE FROM tiendanube_oauth_states WHERE expires_at < now()");
  await getPool().query("INSERT INTO tiendanube_oauth_states (hash,app_version,expires_at) VALUES ($1,$2,now()+interval '10 minutes')", [hash(state), appVersion(app)]);
  const url = new URL(`/admin/apps/${app.clientId}/authorize`, app.shopUrl);
  url.searchParams.set("state", state);
  return { state, url: url.href };
}
export async function consumeStoreOAuthState(state: string, cookie: string) {
  if (!/^[a-f0-9]{64}$/.test(state) || !secretMatches(state, cookie)) throw new Error("La autorización venció o no pertenece a este navegador");
  await ensureStoreConnectionTable();
  const result = await getPool().query("DELETE FROM tiendanube_oauth_states WHERE hash=$1 AND expires_at>now() RETURNING app_version", [hash(state)]);
  if (!result.rows[0]) throw new Error("La autorización venció o ya fue utilizada");
  const app = await loadStoreOAuthApp();
  if (!app || result.rows[0].app_version !== appVersion(app)) throw new Error("La configuración de la app cambió. Volvé a autorizar");
  return app;
}
export async function verifyStoreConnection(credentials: StoreCredentials, expectedDomain?: string) {
  const store = await storeRequest<{ id: number; name: Record<string, string>; domains: string[]; original_domain: string; main_currency: string }>("/store?fields=id,name,domains,original_domain,main_currency", "GET", undefined, credentials);
  if (String(store.id) !== credentials.storeId) throw new StoreApiError("La autorización no corresponde a la tienda indicada", 422);
  if (store.main_currency !== "ARS") throw new StoreApiError("Este panel publica precios en ARS. La tienda autorizada usa otra moneda", 422);
  if (expectedDomain) {
    const host = (value: string) => new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
    if (![...(store.domains ?? []), store.original_domain].filter(Boolean).some(d => host(d) === host(expectedDomain))) throw new StoreApiError("Autorizaste otra tienda. Ingresá a la tienda configurada y volvé a conectar", 422);
  }
  await storeRequest("/products?per_page=1&fields=id", "GET", undefined, credentials);
  return { ...credentials, storeName: store.name.es || store.name.es_AR || Object.values(store.name)[0] || "Tiendanube", verifiedAt: new Date().toISOString() };
}
export async function finishStoreOAuth(app: StoreOAuthApp, code: string) {
  const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: "authorization_code", code }),
    cache: "no-store", signal: AbortSignal.timeout(20000), redirect: "error",
  });
  if (!response.ok) throw new Error("Tiendanube no aceptó la autorización. Revisá el ID, la clave de la app y la URL de retorno");
  const token = await response.json();
  if (typeof token.access_token !== "string" || !token.access_token || !/^\d+$/.test(String(token.user_id))) throw new Error("La respuesta de autorización no es válida");
  if (typeof token.scope !== "string" || !token.scope.split(/[\s,]+/).includes("write_products")) throw new Error("La aplicación necesita el permiso de escritura de productos");
  const value = await verifyStoreConnection({ storeId: String(token.user_id), token: token.access_token,
    userAgent: `PLUG (${app.contactEmail})`, source: "panel" }, app.shopUrl);
  await saveStoreCredentials(value);
  return value;
}
