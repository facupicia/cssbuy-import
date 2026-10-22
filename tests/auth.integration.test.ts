import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { NextRequest } from "next/server";

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test("cuentas y sesiones con PostgreSQL real: alta única, renovación, revocación y permisos", { timeout: 120_000 }, async () => {
  const before = { ...process.env };
  const port = await freePort();
  const directory = await mkdtemp(join(tmpdir(), "plug-auth-test-"));
  const database = new EmbeddedPostgres({
    databaseDir: directory, port, user: "postgres", password: "local-test-only",
    persistent: false, onLog: () => {}, onError: () => {},
    initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"],
  });
  let pool: import("pg").Pool | undefined;
  try {
    await database.initialise(); await database.start();
    Object.assign(process.env, {
      PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGPASSWORD: "local-test-only", PGDATABASE: "postgres",
      ADMIN_PASSWORD: "initial-test-key-separate-from-user", BUSINESS_APP_ORIGIN: "https://panel.example",
    });
    delete process.env.BETTER_AUTH_SECRET;
    const { getPool } = await import("../src/lib/db"); pool = getPool();
    const { getAuth, ensureAuthSchema } = await import("../src/lib/auth");
    const { POST: bootstrap } = await import("../src/app/api/admin/bootstrap/route");
    const status = await import("../src/app/api/admin/session/route");
    const auth = await import("../src/app/api/auth/[...all]/route");
    const { storeAuthenticated } = await import("../src/lib/admin-session");
    const { proxy } = await import("../src/proxy");
    const { authorizeIntegration } = await import("../src/lib/integration-auth");
    const request = (path: string, body?: unknown, cookie = "", origin = "https://panel.example") => new Request(`https://panel.example${path}`, {
      method: body === undefined ? "GET" : "POST", headers: { origin, cookie, "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookies = (response: Response) => response.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("=")).join("; ");
    const signup = { name: "PLUG", email: "owner@example.com", password: "personal-password-for-test", adminPassword: process.env.ADMIN_PASSWORD, rememberMe: true };

    await ensureAuthSchema(); await ensureAuthSchema();
    assert.equal((await (await status.GET(request("/api/admin/session"))).json()).setupRequired, true);
    assert.equal((await auth.POST(request("/api/auth/sign-up/email", signup))).status, 404);
    assert.equal((await auth.POST(request("/api/auth/sign-in/email", {}, "", "https://evil.example"))).status, 403);
    assert.equal((await bootstrap(request("/api/admin/bootstrap", { ...signup, adminPassword: "wrong" }))).status, 401);
    const [first, second] = await Promise.all([
      bootstrap(request("/api/admin/bootstrap", signup)),
      bootstrap(request("/api/admin/bootstrap", { ...signup, email: "other@example.com" })),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const signedIn = first.status === 200 ? first : second;
    const ownerEmail = first.status === 200 ? signup.email : "other@example.com";
    const cookie = cookies(signedIn);
    assert.match(signedIn.headers.get("set-cookie")!, /HttpOnly/i);
    assert.match(signedIn.headers.get("set-cookie")!, /Secure/i);
    assert.match(signedIn.headers.get("set-cookie")!, /SameSite=Lax/i);
    assert.match(signedIn.headers.get("set-cookie")!, /Max-Age=2592000/i);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, cookie)), true);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, `${cookie}tampered`)), false);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, "store_session=old")), false);
    assert.equal((await (await status.GET(request("/api/admin/session", undefined, cookie))).json()).setupRequired, false);
    const account = await pool.query('SELECT * FROM plug_account');
    assert.notEqual(account.rows[0].password, signup.password);
    assert.equal((await pool.query("SELECT * FROM plug_user")).rows.length, 1);
    delete process.env.BUSINESS_READ_API_KEY;
    assert.equal(await authorizeIntegration(request("/api/integraciones/costos", undefined, cookie)), null);

    // Private route checks run before touching inventory or contacting services.
    const inventory = await import("../src/app/api/inventario/route");
    assert.equal((await inventory.GET(request("/api/inventario"))).status, 401);
    assert.equal((await inventory.POST(request("/api/inventario", {}, cookie, "https://evil.example"))).status, 403);
    const denied = await proxy(new NextRequest("https://panel.example/inventario?marca=test"));
    assert.match(denied.headers.get("location")!, /ingresar\?volver=/);
    for (const asset of ["/plug-storefront.min.js", "/plug-storefront-theme.css", "/storefront-video.html", "/storefront-carousel.html", "/plug-cssbuy-connector.zip"]) {
      assert.equal((await proxy(new NextRequest(`https://panel.example${asset}`))).headers.get("x-middleware-next"), "1");
    }
    assert.equal((await proxy(new NextRequest("https://panel.example/configuracion", { headers: { cookie } }))).headers.get("x-middleware-next"), "1");

    // Simulate yesterday's session and verify a request extends both DB and cookie.
    await pool.query('UPDATE plug_session SET "expiresAt"=now()+interval \'28 days\', "updatedAt"=now()-interval \'2 days\'');
    const renewed = await auth.GET(request("/api/auth/get-session", undefined, cookie));
    assert.match(renewed.headers.get("set-cookie")!, /Max-Age=2592000/i);
    assert.ok(new Date((await pool.query('SELECT "expiresAt" FROM plug_session')).rows[0].expiresAt).getTime() > Date.now() + 29 * 86400000);
    const login = () => auth.POST(request("/api/auth/sign-in/email", { email: ownerEmail, password: signup.password, rememberMe: true }));
    const other = await login(); assert.equal(other.status, 200);
    const otherCookie = cookies(other);
    assert.equal((await auth.POST(request("/api/auth/revoke-other-sessions", {}, cookie))).status, 200);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, otherCookie)), false);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, cookie)), true);
    const third = await login(); const thirdCookie = cookies(third);
    assert.equal((await auth.POST(request("/api/auth/change-password", { currentPassword: signup.password, newPassword: "new-personal-password-for-test", revokeOtherSessions: true }, cookie))).status, 200);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, thirdCookie)), false);
    assert.equal((await login()).status, 401);
    const temporary = await auth.POST(request("/api/auth/sign-in/email", { email: ownerEmail, password: "new-personal-password-for-test", rememberMe: false }));
    assert.equal(temporary.status, 200);
    const sessionCookie = temporary.headers.getSetCookie().find(c => c.includes("plug.session_token="))!;
    assert.doesNotMatch(sessionCookie, /Max-Age=/i);
    const lastCookie = cookies(temporary);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, lastCookie)), true);
    const logout = await status.DELETE(new Request("https://panel.example/api/admin/session", { method: "DELETE", headers: { origin: "https://panel.example", cookie: lastCookie } }));
    assert.equal(logout.status, 200);
    assert.equal(await storeAuthenticated(request("/api/test", undefined, lastCookie)), false);

    const { recoverAccount } = await import("../src/lib/account-recovery");
    await recoverAccount(ownerEmail, "recovered-personal-password-for-test");
    assert.equal(await storeAuthenticated(request("/api/test", undefined, cookie)), false);
    assert.equal((await auth.POST(request("/api/auth/sign-in/email", { email: ownerEmail, password: "new-personal-password-for-test" }))).status, 401);

    // Existing sessions cannot override a changed role, expiration, or deletion.
    const active = cookies(await auth.POST(request("/api/auth/sign-in/email", { email: ownerEmail, password: "recovered-personal-password-for-test" })));
    await pool.query("UPDATE plug_user SET role='viewer'");
    assert.equal(await storeAuthenticated(request("/api/test", undefined, active)), false);
    await pool.query("UPDATE plug_user SET role='admin'");
    await pool.query('UPDATE plug_session SET "expiresAt"=now()-interval \'1 minute\'');
    assert.equal(await storeAuthenticated(request("/api/test", undefined, active)), false);
    assert.equal((await getAuth().api.listSessions({ headers: new Headers({ cookie: active }) }).catch(() => [])).length, 0);
    await pool.query("DELETE FROM plug_access_attempts WHERE key='login'");
    const attempts = await Promise.all(Array.from({ length: 12 }, (_, i) => {
      const attempt = request("/api/auth/sign-in/email", { email: ownerEmail, password: "incorrect-password" });
      attempt.headers.set("x-forwarded-for", `192.0.2.${i + 1}`);
      return auth.POST(attempt);
    }));
    assert.equal(attempts.filter(r => r.status === 429).length, 2);

  } finally {
    if (pool) await pool.end();
    await database.stop();
    process.env = before;
  }
});
