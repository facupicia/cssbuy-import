import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

await mkdir(".impeccable/review", { recursive: true });
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3001";
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    let authenticated = false, remoteWrites = 0;
    const item = { id: "12345678-1234-1234-1234-123456789abc", nombre: "Remera Supreme", sku: "SUP-1", variante: "Color:Negro", cantidadInicial: 5, cantidadVendida: 0, costoUnitARS: 20000, costoUnitUSD: 10, precioVentaARS: 60000, estado: "en_deposito", origen: "manual", marcaId: "brand", talles: null, createdAt: "2026-10-15T12:00:00Z", updatedAt: "2026-10-15T12:00:00Z", tienda: { descripcion: "", categoria: "Remeras", categoriaId: 12, fotos: ["https://example.com/product.png"], pesoKg: 0.3, descuentoPct: 10, redondearA: 100 } };
    await page.route("https://example.com/product.png", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#e7e5e4"/></svg>' }));
    await page.route("**/api/**", route => {
      const req = route.request(), url = new URL(req.url());
      const ok = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname === "/api/admin/session" || url.pathname === "/api/tiendanube/session") {
        if (req.method() === "POST") { if (req.postDataJSON().password !== "administracion-de-prueba") return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Contraseña incorrecta" }) }); authenticated = true; }
        if (req.method() === "DELETE") authenticated = false;
        return ok({ authenticated, adminConfigured: true, configured: true, ...(authenticated ? { storeId: "99" } : {}) });
      }
      if (url.pathname === "/api/inventario") return ok({ items: [item, { ...item, id: "22345678-1234-1234-1234-123456789abc", nombre: "Otra remera" }] });
      if (url.pathname === "/api/marcas") return ok({ marcas: [{ id: "brand", nombre: "Supreme", activa: true }] });
      if (url.pathname === "/api/tiendanube/connection") return ok({ connection: { storeId: "99", storeName: "PLUG", source: "environment", verifiedAt: null }, app: null, callbackUrl: "https://panel.example/callback" });
      if (url.pathname === "/api/tiendanube") { if (req.method() === "POST") remoteWrites++; return ok(url.searchParams.has("resource") ? { categories: [{ id: 12, name: "Remeras" }] } : { links: {} }); }
      if (url.pathname === "/api/tiendanube/catalog") { if (req.method() === "POST") remoteWrites++; return ok({ storeId: "99", products: [{ id: 100, name: "Supreme remota", brand: "Supreme", categoryIds: [12], descriptionHtml: "", visibility: "visible", updatedAt: item.updatedAt, version: "a".repeat(64), variants: [{ id: 1, label: "S", sku: "SUP-S", price: 60000, weight: 0.3, promotionalPrice: null }] }], hasMore: false }); }
      if (url.pathname === "/api/publicidad/session") return route.fulfill({ status: authenticated ? 200 : 401, contentType: "application/json", body: JSON.stringify({ authenticated }) });
      if (url.pathname.startsWith("/api/integraciones")) return ok({ campaigns: [], products: [], range: { since: "2026-10-01", until: "2026-10-15" }, assumptions: {} });
      return ok({});
    });
    await page.goto(`${baseUrl}/tiendanube/publicar?ids=${item.id}`);
    await page.getByRole("link", { name: "Abrir acceso de administración", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.getByLabel("Contraseña de administración", { exact: true }).count(), 0);
    await page.getByRole("link", { name: "Abrir acceso de administración", exact: true }).click();
    await page.getByLabel("Contraseña de administración", { exact: true }).fill("incorrecta");
    await page.getByRole("button", { name: "Ingresar y volver a mi tarea", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Contraseña incorrecta" }).waitFor();
    await page.getByLabel("Contraseña de administración", { exact: true }).fill("administracion-de-prueba");
    await page.getByRole("button", { name: "Ingresar y volver a mi tarea", exact: true }).click();
    await page.waitForURL(`**/tiendanube/publicar?ids=${item.id}`);
    await page.getByText("Tiendanube conectada", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Otra remera/ }).count(), 0);
    assert.equal(remoteWrites, 0);
    await page.getByRole("button", { name: "Editar ficha en inventario", exact: true }).click();
    await page.getByRole("main", { name: "Editar producto", exact: true }).waitFor();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.waitForURL(`**/tiendanube/publicar?ids=${item.id}`);
    await page.getByText("Tiendanube conectada", { exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.impeccable/review/store-workspace-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Editar catálogo", exact: true }).click();
    await page.getByText("Supreme remota", { exact: true }).waitFor();
    await page.getByLabel("Cambio de precio de lista", { exact: true }).selectOption("percent");
    await page.getByLabel("Variación del precio (%)", { exact: true }).fill("10");
    await page.getByRole("link", { name: "Publicar productos", exact: true }).click();
    await page.getByRole("dialog", { name: "Salir sin aplicar los cambios", exact: true }).waitFor();
    await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
    assert.equal(await page.getByLabel("Variación del precio (%)", { exact: true }).inputValue(), "10");
    assert.equal(remoteWrites, 0);
    await page.getByRole("link", { name: "Configuración", exact: true }).click();
    await page.getByRole("button", { name: "Descartar y salir", exact: true }).click();
    await page.getByText("Sesión de administración activa", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Cerrar acceso de administración", exact: true }).click();
    await page.getByRole("button", { name: "Habilitar acceso", exact: true }).waitFor();
    await page.goto(`${baseUrl}/publicidad`);
    await page.getByRole("link", { name: "Abrir acceso de administración", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Contraseña de administración", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close(); console.log(`Centro de tienda ${width}px: páginas separadas, acceso común, errores, retorno con selección, descarte y cierre global OK`);
  }
} finally { await browser.close(); }
