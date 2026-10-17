import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } }); page.setDefaultTimeout(12000);
    const base = { id: "12345678-1234-1234-1234-123456789abc", nombre: "Campera uno", sku: "C1", variante: "Color:Negro",
      cantidadInicial: 5, cantidadVendida: 0, costoUnitARS: 10000, costoUnitUSD: 10, precioVentaARS: 45000,
      estado: "en_deposito", origen: "manual", marcaId: "brand", talles: null,
      createdAt: "2026-10-15T12:00:00Z", updatedAt: "2026-10-15T12:00:00Z",
      tienda: { descripcion: "", categoria: "Camperas", categoriaId: 12, fotos: ["https://example.com/photo.jpg"], pesoKg: 0.5, descuentoPct: 10, redondearA: 0 } };
    const second = { ...base, id: "22345678-1234-1234-1234-123456789abc", nombre: "Campera dos", sku: "C2" };
    const invalid = { ...base, id: "32345678-1234-1234-1234-123456789abc", nombre: "Campera incompleta", sku: "C3", tienda: { ...base.tienda, pesoKg: 0 } };
    const catalogBase = { id: 100, name: "Remera remota", brand: "Bape", categoryIds: [12], descriptionHtml: "<p>Tabla existente</p>",
      visibility: "visible", updatedAt: base.updatedAt, version: "a".repeat(64), variants: [{ id: 1, label: "S", sku: "REMOTE-S", price: 100, weight: 0.3, promotionalPrice: null }] };
    let catalogAttempts = []; let uploads = []; let failedUpload = false; let failedCatalog = false;
    await page.route("https://example.com/photo.jpg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1280"><rect width="1280" height="1280" fill="white"/></svg>' }));
    await page.route("**/api/**", async route => {
      const request = route.request(); const url = new URL(request.url());
      const ok = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname === "/api/inventario") return ok({ items: [base, second, invalid] });
      if (url.pathname === "/api/marcas") return ok({ marcas: [{ id: "brand", nombre: "Bape", activa: true }] });
      if (url.pathname === "/api/tiendanube/session") return ok({ authenticated: true, configured: true, adminConfigured: true, storeId: "99" });
      if (url.pathname === "/api/tiendanube/connection") return ok({ connection: { storeId: "99", storeName: "PLUG", source: "panel" }, app: null, callbackUrl: "https://panel.example/callback" });
      if (url.pathname === "/api/tiendanube") {
        if (request.method() === "POST") {
          const body = request.postDataJSON(); uploads.push(body);
          if (body.id === second.id && !failedUpload) { failedUpload = true; return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Error temporal de prueba" }) }); }
          return ok({ productId: body.id === base.id ? 100 : 200, published: body.publish });
        }
        if (url.searchParams.has("resource")) return ok({ categories: [{ id: 12, name: "Camperas" }] });
        return ok({ links: { [second.id]: { product_id: "200", visibility: "visible", synced_at: null, error: null } } });
      }
      if (url.pathname === "/api/tiendanube/catalog") {
        if (request.method() === "POST") {
          const body = request.postDataJSON(); catalogAttempts.push(body);
          if (!failedCatalog) { failedCatalog = true; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Respuesta perdida de prueba" }) }); }
          return ok({ product: catalogBase, complete: true });
        }
        return ok({ storeId: "99", products: [catalogBase, { ...catalogBase, id: 101, name: "Buzo remoto", variants: [{ ...catalogBase.variants[0], id: 2, price: 200 }] }], hasMore: false });
      }
      return ok({});
    });
    async function open() {
      await page.getByRole("button", { name: "Herramientas", exact: true }).click();
      await page.getByRole("menuitem", { name: "Preparar y publicar productos", exact: true }).click();
      await page.getByText("Tiendanube conectada", { exact: true }).waitFor();
    }
    await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3001"}/inventario`); await open();
    await page.getByRole("button", { name: "Publicar en lote", exact: true }).click();
    await page.getByRole("button", { name: "Seleccionar listos", exact: true }).click();
    assert.equal(await page.getByLabel("Incluir Campera incompleta en el lote", { exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Publicar 2 seleccionados", exact: true }).click(); assert.equal(uploads.length, 0);
    await page.getByRole("button", { name: "Confirmar lote de publicación", exact: true }).click();
    await page.getByRole("link", { name: "Configuración", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Hay un envío en curso" }).waitFor();
    assert.ok(page.url().includes("/tiendanube/publicar"));
    await page.getByText("Lote terminado: 1 completados y 1 con error.", { exact: true }).waitFor();
    assert.equal(uploads.length, 2); assert.equal(uploads[1].productId, "200"); assert.equal(uploads[0].storeId, "99");
    await page.getByRole("button", { name: "Seleccionar fallidos", exact: true }).click();
    await page.getByRole("button", { name: "Publicar 1 seleccionados", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar lote de publicación", exact: true }).click();
    await page.getByText("Lote terminado: 1 completados y 0 con error.", { exact: true }).waitFor();
    assert.equal(uploads.filter(u => u.id === base.id).length, 1);
    await page.getByRole("link", { name: "Editar catálogo", exact: true }).click();
    await page.getByText("Remera remota", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Seleccionar esta página", exact: true }).click();
    await page.getByLabel("Cambio de precio de lista", { exact: true }).selectOption("percent");
    await page.getByLabel("Variación del precio (%)", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Revisar edición de 2 productos", exact: true }).click(); assert.equal(catalogAttempts.length, 0);
    await page.getByRole("button", { name: "Confirmar edición del catálogo", exact: true }).click();
    await page.getByText("0 completados · 1 con error · 1 pendientes.", { exact: true }).waitFor();
    const firstOperation = catalogAttempts[0].operationId;
    await page.reload();
    await page.getByText("Lote recuperado. Podés revisar sus resultados y retomar los pendientes.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Reintentar pendientes y fallidos", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar edición del catálogo", exact: true }).click();
    await page.getByText("2 completados · 0 con error · 0 pendientes.", { exact: true }).waitFor();
    assert.equal(catalogAttempts[1].operationId, firstOperation);
    assert.equal(catalogAttempts[2].id, 101);
    assert.deepEqual(catalogAttempts[1].changes, { price: { mode: "percent", value: 10 } });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole("button", { name: "Nueva edición / actualizar catálogo", exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(async () => { window.scrollTo(0,0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.screenshot({ path: `.impeccable/review/tiendanube-bulk-${width}.png`, fullPage: true });
    await page.close(); console.log(`Tiendanube lotes ${width}px: publicación, errores parciales, catálogo remoto y recuperación tras recarga OK`);
  }
} finally { await browser.close(); }
