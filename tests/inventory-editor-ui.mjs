import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Isolated fixture: these flows never write to the real inventory or Tiendanube.
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
await mkdir(".impeccable/review", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    let failSave = false;
    let creates = 0;
    let updates = 0;
    let storeWrites = 0;
    const stamp = "2026-10-16T12:00:00.000Z";
    let items = [{ id: "12345678-1234-1234-1234-123456789abc", nombre: "Buzo Sp5der VVS", marcaId: "sp5der", variante: "Color:Negro", sku: "SP5-VVS",
      cantidadInicial: 7, cantidadVendida: 2, costoUnitARS: 62000, costoUnitUSD: 42, precioVentaARS: 140000, estado: "en_deposito", origen: "manual",
      notas: "Revisar embalaje antes del despacho", createdAt: stamp, updatedAt: stamp,
      talles: [{ talle: "M", cantidadInicial: 3, cantidadVendida: 1, sku: "SP5-M" }, { talle: "L", cantidadInicial: 4, cantidadVendida: 1, sku: "SP5-L" }],
      tienda: { descripcion: "", categoria: "Buzos", categoriaId: null, fotos: [], pesoKg: 0.65, descuentoPct: 10, redondearA: 100 } }];
    await page.route("**/api/**", async route => {
      const req = route.request(); const u = new URL(req.url());
      const ok = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      if (u.pathname === "/api/marcas") return ok({ marcas: [{ id: "sp5der", nombre: "Sp5der", activa: true, createdAt: stamp }] });
      if (u.pathname === "/api/inventario") {
        if (req.method() === "POST") {
          creates++; const created = { ...req.postDataJSON(), id: "new-item", createdAt: stamp, updatedAt: stamp }; items = [...items, created]; return ok({ item: created });
        }
        return ok({ items });
      }
      if (u.pathname.startsWith("/api/inventario/") && req.method() === "PATCH") {
        if (failSave) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "No se pudo conectar. Volvé a guardar." }) });
        updates++; const id = u.pathname.split("/").pop(); items = items.map(i => i.id === id ? { ...i, ...req.postDataJSON() } : i); return ok({ item: items.find(i => i.id === id) });
      }
      if (u.pathname === "/api/tiendanube/session") return ok({ configured: false, authenticated: false, adminConfigured: false });
      if (u.pathname.startsWith("/api/tiendanube") && req.method() !== "GET") storeWrites++;
      return ok({});
    });
    await page.goto(`${base}/inventario`);
    await page.getByRole("button", { name: "Buzo Sp5der VVS", exact: true }).filter({ visible: true }).click();
    const editor = page.getByRole("main", { name: "Editar producto", exact: true });
    assert.equal(await page.getByRole("dialog").count(), 0);
    await editor.getByLabel("Color", { exact: true }).fill("");
    await editor.getByLabel("Color", { exact: true }).pressSequentially("Azul marino");
    assert.equal(await editor.getByLabel("Color", { exact: true }).inputValue(), "Azul marino");
    await editor.getByRole("tab", { name: /^Costos y precio/ }).click();
    await editor.getByLabel("Precio venta ARS", { exact: true }).fill("145000");
    await editor.getByLabel("Descuento por transferencia (%)", { exact: true }).fill("15");
    await editor.getByRole("tab", { name: /^Producto/ }).click();
    assert.equal(await editor.getByLabel("Color", { exact: true }).inputValue(), "Azul marino");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `.impeccable/review/inventory-editor-${width}.png`, fullPage: true });
    await editor.getByRole("tab", { name: /^Talles y stock/ }).click();
    await editor.getByLabel("Vendidas talle M").fill("9");
    await editor.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: "Revisá las unidades" }).waitFor();
    assert.equal(updates, 0);
    await editor.getByLabel("Vendidas talle M").fill("1");
    assert.equal(await editor.getByRole("alert").count(), 0);
    await editor.getByRole("button", { name: "Una variante", exact: true }).click();
    await page.getByRole("dialog", { name: "¿Unificar el stock en una variante?" }).getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(await editor.getByLabel("Compradas talle M").isVisible(), true);
    await editor.getByRole("tab", { name: /^Fotos y tienda/ }).click();
    await editor.getByRole("heading", { name: /Tabla de talles · Sp5der/ }).waitFor();
    assert.equal(await editor.locator('input[type="file"]').count(), 1);
    assert.equal(await editor.getByLabel("Descuento por transferencia (%)", { exact: true }).isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `.impeccable/review/inventory-store-${width}.png`, fullPage: true });
    await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
    const discard = page.getByRole("dialog", { name: "¿Descartar los cambios sin guardar?" });
    await discard.getByRole("button", { name: "Seguir editando", exact: true }).click();
    failSave = true;
    await editor.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: "Volvé a guardar" }).waitFor();
    await editor.getByRole("tab", { name: /^Costos y precio/ }).click();
    assert.equal(await editor.getByLabel("Precio venta ARS", { exact: true }).inputValue(), "145000");
    failSave = false;
    await editor.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await editor.waitFor({ state: "hidden" });
    assert.equal(updates, 1);
    assert.equal(items[0].precioVentaARS, 145000);
    assert.equal(items[0].tienda.descuentoPct, 15);
    assert.equal(items[0].notas, "Revisar embalaje antes del despacho");
    assert.equal(storeWrites, 0);
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => [...document.querySelectorAll("p")].filter(p => ["Producto actualizado", "No se pudo guardar"].includes(p.textContent)).every(p => Number(getComputedStyle(p.parentElement.parentElement).opacity) === 0), { timeout: 10000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `.impeccable/review/inventory-list-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Crear producto", exact: true }).click();
    const create = page.getByRole("main", { name: "Crear producto", exact: true });
    await create.getByRole("button", { name: "Crear producto", exact: true }).click();
    await create.getByRole("alert").filter({ hasText: "Escribí el nombre" }).waitFor();
    assert.equal(creates, 0);
    await create.getByLabel("Nombre del producto", { exact: true }).fill("Remera nueva");
    await create.getByLabel("Color", { exact: true }).fill("Blanco");
    await create.getByRole("tab", { name: /^Talles y stock/ }).click();
    await create.getByRole("button", { name: "Varios talles", exact: true }).click();
    for (const size of ["M", "L"]) await create.getByRole("button", { name: size, exact: true }).click();
    await create.getByLabel("Compradas talle M").fill("4");
    // A deliberate conversion preserves totals and cannot resurrect an obsolete size breakdown.
    await create.getByRole("button", { name: "Una variante", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Usar una variante", exact: true }).click();
    await create.getByLabel("Compradas", { exact: true }).fill("11");
    await create.getByRole("button", { name: "Varios talles", exact: true }).click();
    await create.getByRole("alert").filter({ hasText: "Indicá el talle" }).waitFor();
    await create.getByLabel("Talle de esta variante", { exact: true }).fill("XL");
    await create.getByRole("button", { name: "Varios talles", exact: true }).click();
    assert.equal(await create.getByLabel("Compradas talle XL").inputValue(), "11");
    await create.getByRole("button", { name: "Crear producto", exact: true }).click();
    await create.waitFor({ state: "hidden" });
    assert.equal(creates, 1);
    assert.equal(items[1].cantidadInicial, 11);
    assert.equal(items[1].talles.length, 1);
    assert.equal(items[1].tienda.fotos.length, 0);
    await page.getByRole("button", { name: "Crear producto", exact: true }).click();
    await create.getByLabel("Nombre del producto", { exact: true }).fill("No guardar esta prueba");
    await page.getByRole("navigation").getByRole("link", { name: "Tienda", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Seguir editando", exact: true }).click();
    await create.getByRole("button", { name: "Volver al inventario", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Descartar cambios", exact: true }).click();
    await create.waitFor({ state: "hidden" });
    assert.equal(creates, 1);
    assert.equal(new URL(page.url()).pathname, "/inventario");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: crear, editar, conservar borrador, validar stock, precios y guardar sin publicar OK`);
  }
} finally { await browser.close(); }
