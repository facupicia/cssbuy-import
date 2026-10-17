import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

await mkdir(".impeccable/review", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    let authenticated = false;
    let configured = false;
    let savedApp = null;
    const callbackUrl = "https://db.vidaeventofiesta.site/api/tiendanube/oauth/callback";
    await page.route("**/api/**", async route => {
      const request = route.request(); const url = new URL(request.url());
      const ok = value => route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
      if (url.pathname === "/api/inventario") return ok({ items: [] });
      if (url.pathname === "/api/marcas") return ok({ marcas: [] });
      if ((url.pathname === "/api/tiendanube/session" || url.pathname === "/api/admin/session")) {
        if (request.method() === "POST") { authenticated = true; return ok({ ok: true }); }
        return ok({ configured, authenticated, adminConfigured: true, storeId: configured && authenticated ? "99" : undefined });
      }
      if (url.pathname === "/api/tiendanube/connection") {
        if (request.method() === "POST") { savedApp = request.postDataJSON(); return ok({ ok: true }); }
        return ok({ connection: configured ? { storeId: "99", storeName: "PLUG", source: "panel", verifiedAt: new Date().toISOString() } : null,
          app: savedApp ? { clientId: savedApp.clientId, shopUrl: savedApp.shopUrl, contactEmail: savedApp.contactEmail } : null, callbackUrl });
      }
      if (url.pathname === "/api/tiendanube/oauth/start") return ok({ url: "https://plugrosario.xyz/admin/apps/123/authorize?state=test" });
      if (url.pathname === "/api/tiendanube") return ok(url.searchParams.has("resource") ? { categories: [] } : { links: {} });
      return ok({});
    });
    await page.route("https://plugrosario.xyz/admin/apps/123/authorize*", route => route.fulfill({ contentType: "text/html", body: "<h1>Autorización de prueba</h1>" }));
    await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3001"}/configuracion`);
    await page.getByLabel("Contraseña de administración", { exact: true }).fill("contraseña-de-prueba");
    await page.getByRole("button", { name: "Habilitar acceso", exact: true }).click();
    const dialog = page.getByRole("main");
    await dialog.getByLabel("URL de retorno para configurar en Tiendanube", { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("URL de retorno para configurar en Tiendanube", { exact: true }).inputValue(), callbackUrl);
    await dialog.getByLabel("Correo de contacto de la integración", { exact: true }).fill("contacto@example.com");
    await dialog.getByLabel("ID de la aplicación", { exact: true }).fill("123");
    await dialog.getByLabel("Clave secreta de la aplicación", { exact: true }).fill("secret-only-for-this-test");
    await dialog.getByRole("button", { name: "Guardar app", exact: true }).click();
    await dialog.getByText("App guardada. Ahora autorizá el acceso desde tu Tiendanube", { exact: true }).waitFor();
    assert.equal(savedApp.shopUrl, "https://plugrosario.xyz");
    assert.equal(await dialog.getByLabel("Clave secreta de la aplicación", { exact: true }).inputValue(), "");
    assert.ok(!(await dialog.innerText()).includes(savedApp.clientSecret));
    await dialog.getByRole("button", { name: "Autorizar conexión en Tiendanube", exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(async () => { window.scrollTo(0,0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.screenshot({ path: `.impeccable/review/conexion-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await dialog.getByRole("button", { name: "Autorizar conexión en Tiendanube", exact: true }).click();
    await page.waitForURL("https://plugrosario.xyz/admin/apps/123/authorize?state=test");
    configured = true;
    await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3001"}/inventario?tiendanube=connected`);
    await page.getByRole("main").getByText("Tiendanube conectada. Ya podés publicar productos o editar el catálogo.", { exact: true }).waitFor();
    await page.getByRole("main").getByText("PLUG", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`Conexión ${width}px: ingreso antes de conectar, app privada, clave oculta, autorización y regreso al inventario OK`);
    await page.close();
  }
} finally { await browser.close(); }
