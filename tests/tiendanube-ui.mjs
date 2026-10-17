import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// Run with the local development server on port 3001. All business APIs are mocked.
const output = ".impeccable/review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(12000);
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#57534e"; ctx.fillRect(0, 0, 640, 360);
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    const portrait = await sharp(png).rotate(90).png().toBuffer();
    const remoteNormalized = await sharp(png).resize(1280, 1280, { fit: "contain", background: "#fff" }).jpeg().toBuffer();
    const pageErrors = [];
    let connected = false;
    let sent = null;
    let failNormalization = false;
    page.on("pageerror", e => pageErrors.push(e.message));
    let item = { id: "12345678-1234-1234-1234-123456789abc", nombre: "Campera de algodón", sku: "CAMP-1", variante: "Color:Negro",
      cantidadInicial: 5, cantidadVendida: 1, costoUnitARS: 20000, costoUnitUSD: 20, precioVentaARS: 45000,
      estado: "en_deposito", origen: "manual", marcaId: "marca", notas: "NOTA INTERNA CONFIDENCIAL",
      createdAt: "2026-10-15T12:00:00.000Z", updatedAt: "2026-10-15T12:00:00.000Z",
      talles: [{ talle: "M", cantidadInicial: 3, cantidadVendida: 1, sku: "CAMP-M" }, { talle: "L", cantidadInicial: 2, cantidadVendida: 2, sku: "CAMP-L" }],
      tienda: { descripcion: "Campera de algodón de calce amplio.\nCuello alto y cierre frontal.", categoria: "Camperas", categoriaId: 12,
        fotos: ["https://example.com/campera.jpg"], pesoKg: 0.6, descuentoPct: 10, redondearA: 100 } };
    await page.route("https://example.com/campera.jpg", route => route.fulfill({ contentType: "image/png", body: png }));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const ok = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname === "/api/inventario/fotos/normalizar") {
        if (failNormalization) return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Foto no disponible" }) });
        return ok({ data: `data:image/jpeg;base64,${remoteNormalized.toString("base64")}`, upscaled: true });
      }
      if (url.pathname === "/api/marcas") return ok({ marcas: [{ id: "marca", nombre: "PLUG", activa: true, createdAt: item.createdAt }] });
      if (url.pathname === "/api/inventario") return ok({ items: [item] });
      if (url.pathname === `/api/inventario/${item.id}` && request.method() === "PATCH") { item = { ...item, ...request.postDataJSON() }; return ok({ item }); }
      if (url.pathname === "/api/tiendanube/session") return ok({ configured: connected, authenticated: connected, adminConfigured: connected, storeId: connected ? "99" : undefined });
      if (url.pathname === "/api/tiendanube") {
        if (request.method() === "POST") { sent = request.postDataJSON(); return ok({ productId: 100, published: sent.publish }); }
        if (url.searchParams.get("resource") === "categories") return ok({ categories: [{ id: 12, name: "Camperas" }] });
        return ok({ links: {} });
      }
      return ok({});
    });
    await page.goto(`${process.env.TEST_BASE_URL || "http://localhost:3001"}/inventario`);
    await page.getByRole("button", { name: "Herramientas" }).click();
    await page.getByRole("menuitem", { name: "Preparar y publicar productos" }).click();
    const preview = page.getByRole("main");
    await preview.getByText("La ficha está completa.").waitFor();
    assert.ok(!(await preview.innerText()).includes("NOTA INTERNA CONFIDENCIAL"));
    assert.equal(await preview.getByRole("button", { name: "Publicar producto", exact: true }).isDisabled(), true);
    await page.evaluate(async () => { window.scrollTo(0,0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.screenshot({ path: `${output}/tiendanube-${viewport.width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await preview.getByRole("button", { name: "Editar ficha en inventario", exact: true }).click();
    const editor = page.getByRole("main", { name: "Editar producto", exact: true });
    await editor.getByRole("tab", { name: /^Fotos y tienda/ }).click();
    await editor.getByLabel("Descripción pública", { exact: true }).fill("Descripción editada desde el panel");
    await editor.getByLabel("Subir fotos desde tu equipo").setInputFiles([
      { name: "prenda-horizontal.png", mimeType: "image/png", buffer: png },
      { name: "prenda-vertical.png", mimeType: "image/png", buffer: portrait },
    ]);
    await editor.getByRole("heading", { name: "Fotos del producto (3/9)", exact: true }).waitFor();
    // A failed normalization leaves both the original and the newly added photos intact.
    const beforeFailure = await editor.getByRole("img").evaluateAll(images => images.map(i => i.getAttribute("src")));
    failNormalization = true;
    await editor.getByRole("button", { name: "Normalizar todas", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: "La galería anterior se conserva" }).waitFor();
    assert.deepEqual(await editor.getByRole("img").evaluateAll(images => images.map(i => i.getAttribute("src"))), beforeFailure);
    failNormalization = false;
    await editor.getByRole("button", { name: "Normalizar todas", exact: true }).click();
    await editor.getByRole("status").filter({ hasText: "Todas las fotos quedaron" }).waitFor();
    await editor.getByLabel("O agregar por enlace", { exact: true }).fill("https://example.com/otra-foto.jpg");
    await editor.getByRole("button", { name: "Agregar foto", exact: true }).click();
    await editor.getByRole("status").filter({ hasText: "Foto agregada en 1280" }).waitFor();
    await editor.getByRole("button", { name: "Normalizar todas", exact: true }).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: `${output}/galeria-${viewport.width}.png` });
    await editor.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await editor.waitFor({ state: "hidden" });
    assert.equal(item.tienda.descripcion, "Descripción editada desde el panel");
    // Adding the same normalized photo by URL is deduplicated.
    assert.equal(item.tienda.fotos.length, 3);
    assert.ok(item.tienda.fotos[1].startsWith("data:image/jpeg;base64,"));
    for (const data of item.tienda.fotos) {
      const metadata = await sharp(Buffer.from(data.split(",")[1], "base64")).metadata();
      assert.equal(metadata.width, 1280); assert.equal(metadata.height, 1280);
    }
    // Horizontal images get white top/bottom margins and retain the gray product at center.
    const pixels = await sharp(Buffer.from(item.tienda.fotos[1].split(",")[1], "base64")).removeAlpha().raw().toBuffer();
    assert.ok(pixels[0] >= 250 && pixels[1] >= 250 && pixels[2] >= 250);
    const middle = (640 * 1280 + 640) * 3;
    assert.ok(Math.abs(pixels[middle] - 87) <= 5);
    assert.equal(item.notas, "NOTA INTERNA CONFIDENCIAL");
    connected = true;
    await page.getByRole("main").getByRole("button", { name: "Comprobar conexión", exact: true }).click();
    await page.getByRole("main").getByText("Tiendanube conectada", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Guardar oculto", exact: true }).click();
    assert.equal(sent, null);
    await page.getByRole("button", { name: "Confirmar envío oculto", exact: true }).click();
    await page.getByText("Producto guardado en Tiendanube como oculto", { exact: true }).waitFor();
    assert.equal(sent.id, item.id);
    assert.equal(sent.publish, false);
    assert.deepEqual(pageErrors, []);
    console.log(`UI ${viewport.width}px: varias fotos, normalización 1280px, enlaces, recuperación de fallos y envío OK`);
    await page.close();
  }
} finally { await browser.close(); }
