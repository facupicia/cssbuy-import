import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

await mkdir(".impeccable/review", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let authenticated = false;
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === "/api/cssbuy/sync") data = { ok: true, orders: [] };
      if (path === "/api/tiendanube/session") {
        if (route.request().method() === "POST") authenticated = true;
        data = { authenticated, adminConfigured: true };
      }
      if (path === "/api/cssbuy/bridge") data = { lastSync: null, records: [] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto("http://localhost:3001/");
    await page.getByRole("button", { name: "Herramientas de CSSBuy", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sincronizar órdenes", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Conectar CSSBuy" });
    await dialog.getByText("Falta instalar el conector en Chrome", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Sincronizar pedidos y movimientos" }).isDisabled(), true);
    await dialog.screenshot({ path: `.impeccable/review/cssbuy-setup-${width}.png` });
    await dialog.getByLabel("Contraseña de administración").fill("contraseña de prueba");
    await dialog.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.evaluate(() => window.addEventListener("message", event => {
      if (event.data?.channel !== "PLUG_CSSBUY_REQUEST") return;
      const data = event.data;
      window.postMessage({ channel: "PLUG_CSSBUY_RESPONSE", id: data.id, ...(data.action === "ping" ? { available: true } : {
        result: { orders: [], records: [], imported: 3, inserted: 1, updated: 2, warning: null,
          lastSync: { synced_at: new Date().toISOString(), orders_count: 3, records_count: 0 } },
      }) }, location.origin);
    }));
    // Espera el chequeo sin extensión iniciado por el ingreso, antes de repetirlo.
    await dialog.getByRole("button", { name: "Comprobar conector" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Comprobar conector' && !b.disabled));
    await dialog.getByRole("button", { name: "Comprobar conector" }).click();
    await dialog.getByText("Conector de Chrome detectado", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Sincronizar pedidos y movimientos" }).click();
    await dialog.getByText(/3 pedidos válidos procesados/).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await dialog.screenshot({ path: `.impeccable/review/cssbuy-connected-${width}.png` });
    await page.close();
    console.log(`CSSBuy UI ${width}px: instalación, login y sincronización simulada OK`);
  }
} finally { await browser.close(); }
