import { chromium } from "playwright";
import assert from "node:assert/strict";
import { resolve, dirname, basename } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Perfil desechable propio de la prueba, sin acceso al Chrome del usuario.
const profile = await mkdtemp(resolve(tmpdir(), "plug-cssbuy-test-"));
const extension = resolve("extensions/cssbuy-connector");
const context = await chromium.launchPersistentContext(profile, { headless: true, channel: "chromium",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  let posted = null;
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (url.hostname === "www.cssbuy.com") {
      if (url.pathname === "/api/v3/user/order") return json({ code: 0, data: { records: [{ id: "123", state: 4 }], total: 1 } });
      if (url.pathname === "/api/v2/user/record") {
        assert.ok(route.request().headers()["content-type"].startsWith("multipart/form-data;"));
        return json({ code: 0, data: [{ id: "r1", money: -48, action: "Buy Item", remark: "Order id:123" }] });
      }
      return route.fulfill({ contentType: "text/html", body: '<title>CSSBuy de prueba</title><script>localStorage.setItem("css-token","FAKE-CSSBUY-SESSION");</script>' });
    }
    if (url.hostname === "db.vidaeventofiesta.site") {
      if (url.pathname === "/api/tiendanube/session") return json({ authenticated: true });
      if (url.pathname === "/api/cssbuy/bridge") {
        posted = route.request().postDataJSON();
        assert.equal(route.request().headers().origin, "https://db.vidaeventofiesta.site");
        return json({ ok: true, imported: 1 });
      }
      return route.fulfill({ contentType: "text/html", body: `<title>PLUG de prueba</title><button id="sync">Sincronizar</button><pre id="result"></pre><script>
      window.addEventListener('message',e=>{if(e.data?.channel==='PLUG_CSSBUY_RESPONSE')document.querySelector('#result').textContent=JSON.stringify(e.data)});
      document.querySelector('#sync').onclick=()=>window.postMessage({channel:'PLUG_CSSBUY_REQUEST',id:'test',action:'sync'},location.origin);
      </script>` });
    }
    return route.abort();
  });
  const cssbuy = await context.newPage(); await cssbuy.goto("https://www.cssbuy.com/shop/cate/order");
  const panel = await context.newPage(); await panel.goto("https://db.vidaeventofiesta.site/");
  await panel.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await panel.waitForFunction(() => document.querySelector('#result').textContent.includes('"ok":true'), { timeout: 15000 });
  assert.equal(posted.orders.length, 1); assert.equal(posted.records.length, 1);
  assert.ok(!JSON.stringify(posted).includes("FAKE-CSSBUY-SESSION"));
  console.log("Extensión Chrome real: sesión simulada CSSBuy → puente → importación, sin transferir tokens, OK");
} finally {
  await context.close();
  if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith("plug-cssbuy-test-")) throw new Error("Ruta temporal inesperada");
  await rm(profile, { recursive: true, force: true });
}
