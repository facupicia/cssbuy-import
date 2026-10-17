import { test } from "node:test";
import assert from "node:assert/strict";
import { storeAuthenticated, storeSession } from "../src/lib/admin-session";
import { authorizeIntegration } from "../src/lib/integration-auth";
import { storeGuard } from "../src/lib/store-auth";
import { GET, POST, DELETE } from "../src/app/api/admin/session/route";
import { adminReturnPath } from "../src/lib/admin-navigation";

test("un acceso común habilita tienda, CSSBuy y reportes sin ampliar la clave de lectura", async () => {
  const previous = { password: process.env.ADMIN_PASSWORD, key: process.env.BUSINESS_READ_API_KEY, origin: process.env.BUSINESS_APP_ORIGIN };
  process.env.ADMIN_PASSWORD = "administracion-de-prueba-segura";
  process.env.BUSINESS_READ_API_KEY = "read-only-key-for-testing-more-than-32";
  process.env.BUSINESS_APP_ORIGIN = "https://panel.example";
  const request = (cookie = "", method = "GET") => new Request("https://panel.example/api/admin/session", { method, headers: { cookie, origin: "https://panel.example" } });
  try {
    assert.equal((await (await GET(request())).json()).authenticated, false);
    const login = await POST(new Request("https://panel.example/api/admin/session", { method: "POST", headers: { origin: "https://panel.example", "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }));
    assert.equal(login.status, 200);
    const cookie = login.cookies.get("store_session")!.value;
    const authenticated = request(`store_session=${cookie}`);
    assert.equal(storeAuthenticated(authenticated), true);
    assert.equal(storeGuard(authenticated), null);
    assert.equal(authorizeIntegration(authenticated), null);
    assert.equal((await (await GET(authenticated)).json()).authenticated, true);
    assert.equal(storeAuthenticated(request(`store_session=${cookie}x`)), false);
    assert.equal(storeAuthenticated(request(`store_session=${storeSession(process.env.ADMIN_PASSWORD!, Date.now() - 1)}`)), false);
    assert.equal(storeAuthenticated(request(`store_session=${storeSession(process.env.ADMIN_PASSWORD!, Date.now() + 7_200_000)}`)), false);
    assert.equal(storeAuthenticated(request(`store_session=${cookie}.extra`)), false);
    const bearer = new Request("https://panel.example/api/test", { headers: { authorization: `Bearer ${process.env.BUSINESS_READ_API_KEY}` } });
    assert.equal(authorizeIntegration(bearer), null);
    assert.equal(storeGuard(bearer)?.status, 401);
    assert.equal(storeGuard(new Request(authenticated.url, { method: "POST", headers: { cookie: `store_session=${cookie}`, origin: "https://evil.example" } }))?.status, 403);
    const logout = await DELETE(request(`store_session=${cookie}`, "DELETE"));
    assert.equal(logout.cookies.get("store_session")?.value, "");
    assert.equal(logout.cookies.get("reporting_session")?.value, "");
    assert.equal((await POST(new Request(authenticated.url, { method: "POST", headers: { origin: "https://evil.example" } }))).status, 403);
  } finally {
    for (const [name, value] of [["ADMIN_PASSWORD", previous.password], ["BUSINESS_READ_API_KEY", previous.key], ["BUSINESS_APP_ORIGIN", previous.origin]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; }
  }
});
test("retorno de administración conserva filtros y rechaza destinos externos", () => {
  assert.equal(adminReturnPath("/tiendanube/publicar?ids=uno%2Cdos"), "/tiendanube/publicar?ids=uno%2Cdos");
  for (const url of ["//evil.example", "https://evil.example", "/\\evil.example", "/api/tiendanube", "/configuracion", "/inventario\r\n"]) assert.equal(adminReturnPath(url), null);
});
