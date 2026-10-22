import { test } from "node:test";
import assert from "node:assert/strict";
import { storeAuthenticated } from "../src/lib/admin-session";
import { authorizeIntegration } from "../src/lib/integration-auth";
import { storeGuard } from "../src/lib/store-auth";
import { POST } from "../src/app/api/admin/session/route";
import { adminReturnPath } from "../src/lib/admin-navigation";
import { mockAccount } from "./helpers/account";

test("una cuenta habilita el panel; la clave de lectura no obtiene permisos de escritura", async t => {
  const before = { ...process.env };
  process.env.BUSINESS_READ_API_KEY = "read-only-key-for-testing-more-than-32";
  process.env.BUSINESS_APP_ORIGIN = "https://panel.example";
  const cookie = mockAccount(t);
  const request = (value = cookie, origin = "https://panel.example") => new Request("https://panel.example/api/admin/session", { method: "POST", headers: { cookie: value, origin } });
  try {
    assert.equal(await storeAuthenticated(request()), true);
    assert.equal(await storeGuard(request()), null);
    assert.equal(await authorizeIntegration(request()), null);
    assert.equal(await storeAuthenticated(request("store_session=obsolete")), false);
    assert.equal(await storeAuthenticated(request("reporting_session=obsolete")), false);
    assert.equal((await storeGuard(request(cookie, "https://evil.example")))?.status, 403);
    const bearer = new Request("https://panel.example/api/test", { headers: { authorization: `Bearer ${process.env.BUSINESS_READ_API_KEY}` } });
    assert.equal(await authorizeIntegration(bearer), null);
    assert.equal((await storeGuard(bearer))?.status, 401);
    assert.equal((await POST(request())).status, 401);
  } finally { process.env = before; }
});

test("retorno de ingreso conserva filtros y rechaza destinos externos", () => {
  assert.equal(adminReturnPath("/tiendanube/publicar?ids=uno%2Cdos"), "/tiendanube/publicar?ids=uno%2Cdos");
  assert.equal(adminReturnPath("/configuracion?tiendanube=connected"), "/configuracion?tiendanube=connected");
  for (const url of ["//evil.example", "https://evil.example", "/\\evil.example", "/api/tiendanube", "/inventario\r\n"]) assert.equal(adminReturnPath(url), null);
});
