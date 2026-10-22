import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { encryptStoreCredentials, decryptStoreCredentials, loadStoreCredentials } from "../src/lib/store-connection";
import { parseOAuthApp, finishStoreOAuth } from "../src/lib/store-oauth";
import { mockAccount } from "./helpers/account";
import { GET as settings, POST as saveApp, DELETE as disconnect } from "../src/app/api/tiendanube/connection/route";
import { POST as startOAuth } from "../src/app/api/tiendanube/oauth/start/route";
import { GET as callback } from "../src/app/api/tiendanube/oauth/callback/route";
import { GET as session } from "../src/app/api/tiendanube/session/route";

const password = "administracion-de-prueba-segura";
const app = { clientId: "123", clientSecret: "private-application-secret", shopUrl: "https://plugrosario.xyz", contactEmail: "contacto@example.com" };
test("cifrado autenticado: claves distintas por guardado, sin texto plano ni cruce entre tipos", () => {
  const value = { storeId: "99", token: "private-token", userAgent: "PLUG", source: "panel" as const };
  const a = encryptStoreCredentials(value, password);
  const b = encryptStoreCredentials(value, password);
  assert.notEqual(a, b); assert.ok(!a.includes(value.token));
  assert.deepEqual(decryptStoreCredentials(a, password), value);
  assert.throws(() => decryptStoreCredentials(a, "otra-clave"));
  assert.throws(() => decryptStoreCredentials(a, password, "oauth-app"));
  const parts = a.split("."); parts[3] = Buffer.alloc(16).toString("base64");
  assert.throws(() => decryptStoreCredentials(parts.join("."), password));
  assert.equal(parseOAuthApp(app).shopUrl, app.shopUrl);
  assert.throws(() => parseOAuthApp({ ...app, shopUrl: "http://plugrosario.xyz" }));
  assert.throws(() => parseOAuthApp({ ...app, contactEmail: "x\r\ny@example.com" }));
  assert.throws(() => parseOAuthApp({ ...app, clientId: "123/evil" }));
});

test("OAuth privado: guarda secretos cifrados, exige sesión, verifica tienda y permisos y consume state una sola vez", async t => {
  const before = { ...process.env };
  delete process.env.TIENDANUBE_ACCESS_TOKEN; delete process.env.TIENDANUBE_STORE_ID; delete process.env.TIENDANUBE_USER_AGENT;
  process.env.ADMIN_PASSWORD = password; process.env.BUSINESS_APP_ORIGIN = "https://panel.example";
  process.env.PGHOST = "fake"; process.env.PGUSER = "fake"; process.env.PGDATABASE = "fake";
  let appSecret: string | null = null;
  let connectionSecret: string | null = null;
  const states = new Map<string, string>();
  let exchanges = 0;
  let domain = "plugrosario.xyz";
  let scopes = "read_products,write_products";
  const deleted: string[] = [];
  t.mock.method(Pool.prototype, "query", async (sql: string, values: any[] = []) => {
    if (sql.startsWith("INSERT INTO tiendanube_oauth_app")) appSecret = values[0];
    if (sql.startsWith("SELECT secret FROM tiendanube_oauth_app")) return { rows: appSecret ? [{ secret: appSecret }] : [] };
    if (sql.startsWith("INSERT INTO tiendanube_connection")) connectionSecret = values[0];
    if (sql.startsWith("SELECT secret FROM tiendanube_connection")) return { rows: connectionSecret ? [{ secret: connectionSecret }] : [] };
    if (sql.startsWith("INSERT INTO tiendanube_oauth_states")) states.set(values[0], values[1]);
    if (sql.startsWith("DELETE FROM tiendanube_oauth_states WHERE hash=")) { const version = states.get(values[0]); states.delete(values[0]); return { rows: version ? [{ app_version: version }] : [] }; }
    if (sql.startsWith("DELETE FROM tiendanube_connection")) { deleted.push(sql); connectionSecret = null; }
    return { rows: [] };
  });
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (input === "https://www.tiendanube.com/apps/authorize/token") {
      exchanges++; const body = JSON.parse(String(init?.body));
      assert.equal(body.client_secret, app.clientSecret); assert.equal(body.grant_type, "authorization_code");
      assert.equal(init?.redirect, "error");
      return ok({ access_token: "private-store-token", user_id: "99", scope: scopes });
    }
    assert.ok(input.startsWith("https://api.tiendanube.com/2025-03/99/"));
    assert.equal((init?.headers as Record<string,string>).Authorization, "Bearer private-store-token");
    if (input.includes("/store?")) return ok({ id: 99, name: { es: "PLUG" }, domains: [domain], original_domain: "plug.mitiendanube.com", main_currency: "ARS" });
    if (input.includes("/products?")) return ok([]);
    throw new Error("Unexpected API path");
  });
  const cookie = mockAccount(t);
  const request = (path: string, method = "GET", body?: unknown, authenticated = true, origin = "https://panel.example") => new Request(`https://panel.example${path}`, {
    method, headers: { cookie: authenticated ? cookie : "", origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await settings(request("/api/tiendanube/connection", "GET", undefined, false))).status, 401);
    assert.equal((await saveApp(request("/api/tiendanube/connection", "POST", app, true, "https://evil.example"))).status, 403);
    assert.equal((await saveApp(request("/api/tiendanube/connection", "POST", app))).status, 200);
    assert.ok(appSecret && !String(appSecret).includes(app.clientSecret));
    const data = await (await settings(request("/api/tiendanube/connection"))).json();
    assert.equal(data.callbackUrl, "https://panel.example/api/tiendanube/oauth/callback");
    assert.ok(!JSON.stringify(data).includes(app.clientSecret));
    const start = await startOAuth(request("/api/tiendanube/oauth/start", "POST"));
    const url = new URL((await start.json()).url); const state = url.searchParams.get("state")!;
    assert.equal(url.origin, app.shopUrl); assert.equal(url.pathname, "/admin/apps/123/authorize");
    assert.ok(start.headers.get("set-cookie")?.includes("HttpOnly"));
    assert.ok(start.headers.get("set-cookie")?.includes("SameSite=lax"));
    const response = (stateCookie: string) => callback(new Request(`https://panel.example/api/tiendanube/oauth/callback?state=${state}&code=code`, { headers: { cookie: stateCookie } }));
    const denied = await response("tiendanube_oauth_state=wrong");
    assert.ok(denied.headers.get("location")?.endsWith("tiendanube=failed")); assert.equal(exchanges, 0);
    const oauthCookie = `tiendanube_oauth_state=${state}`;
    const result = await response(oauthCookie);
    assert.equal(result.status, 303); assert.ok(result.headers.get("location")?.endsWith("tiendanube=connected"));
    assert.equal(exchanges, 1);
    assert.ok(connectionSecret && !String(connectionSecret).includes("private-store-token"));
    assert.equal((await loadStoreCredentials())?.storeId, "99");
    assert.equal((await (await session(request("/api/tiendanube/session"))).json()).configured, true);
    const visible = await (await settings(request("/api/tiendanube/connection"))).json();
    assert.equal(visible.connection.storeName, "PLUG");
    assert.ok(!JSON.stringify(visible).includes("private-store-token"));
    await response(oauthCookie); assert.equal(exchanges, 1);
    // A successful token exchange still cannot replace the saved connection with another shop.
    domain = "another-store.example";
    const originalSecret = connectionSecret;
    await assert.rejects(() => finishStoreOAuth(app, "new-code"), /otra tienda/);
    assert.equal(connectionSecret, originalSecret);
    domain = "plugrosario.xyz"; scopes = "read_products";
    await assert.rejects(() => finishStoreOAuth(app, "new-code"), /escritura de productos/);
    assert.equal(connectionSecret, originalSecret);
    assert.equal((await disconnect(request("/api/tiendanube/connection", "DELETE"))).status, 200);
    assert.equal(await loadStoreCredentials(), null); assert.equal(deleted.length, 1);
  } finally { process.env = before; }
});
