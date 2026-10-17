import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir(".impeccable/review", { recursive: true });
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
const browser = await chromium.launch({ headless: true });
async function placeholderContrast(locator) {
  return locator.evaluate(element => {
    const rgb = color => color.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance = color => color.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126,0.7152,0.0722][index],0);
    const foreground = luminance(rgb(getComputedStyle(element,"::placeholder").color));
    const background = luminance(rgb(getComputedStyle(element).backgroundColor));
    return (Math.max(foreground,background) + 0.05) / (Math.min(foreground,background) + 0.05);
  });
}
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } }); page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    let authenticated = false, writes = 0, failSave = true;
    let items = Array.from({ length: 13 }, (_, i) => ({ id: `${String(i).padStart(8,"0")}-1234-1234-1234-123456789abc`, nombre: `Proveedor ${String(i).padStart(2,"0")}`, tipo: i % 2 ? "vendedor" : "fabrica", categoria: i % 2 ? "Zapatillas" : "Remeras", tiendaUrl: `https://example.com/shop/${i}`, referenciaUrl: "", contacto: `WeChat: seller${i}`, notas: i === 0 ? "Pedir un talle más. Buena calidad y terminación." : "Consultar disponibilidad antes de comprar.", favorito: i === 0, version: 1, createdAt: "2026-10-16T12:00:00Z", updatedAt: "2026-10-16T12:00:00Z" }));
    const order = { oid: "123456", producto: "Remera de referencia", vendedor: "Textiles del Sur", imagen: "", url: "https://example.com/product/123", variante: "M", cantidad: 2, precio_unitario_cny: 100, envio_local_cny: 10, envio_china_cny: 0, peso_g: 300, estado: "En almacén", tracking: "", fecha_pedido: Date.now() };
    await page.route("**/api/**", route => {
      const req = route.request(), url = new URL(req.url());
      const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname === "/api/admin/session") { if (req.method() === "POST") authenticated = true; return reply({ authenticated, adminConfigured: true }); }
      if (url.pathname === "/api/tiendanube/connection") return reply({ connection: { storeId: "99", storeName: "PLUG", source: "environment" }, app: null, callbackUrl: "https://panel.example/callback" });
      if (url.pathname === "/api/proveedores") {
        if (!authenticated) return reply({ error: "Ingresá la contraseña de administración para continuar" }, 401);
        if (req.method() === "GET") return reply({ proveedores: items });
        writes++;
        if (failSave) { failSave = false; return reply({ error: "No se pudo guardar el cambio. Volvé a intentar." }, 503); }
        const body = req.postDataJSON();
        if (req.method() === "DELETE") { items = items.filter(item => item.id !== body.id); return reply({ ok: true }); }
        if (req.method() === "PATCH") { const item = { ...items.find(i => i.id === body.id), ...body, version: body.version + 1 }; items = items.map(i => i.id === item.id ? item : i); return reply({ proveedor: item }); }
        const item = { ...body, id: `12345678-1234-1234-1234-${String(items.length).padStart(12,"0")}`, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; items.push(item); return reply({ proveedor: item }, 201);
      }
      if (url.pathname === "/api/cssbuy/sync") return reply({ ok: true, orders: [order] });
      return reply({});
    });
    await page.goto(`${base}/calculadora/proveedores`);
    await page.getByRole("link", { name: "Abrir acceso de administración", exact: true }).click();
    await page.getByLabel("Contraseña de administración", { exact: true }).fill("contraseña-de-prueba");
    await page.getByRole("button", { name: "Ingresar y volver a mi tarea", exact: true }).click();
    await page.getByRole("heading", { name: "Vendedores y fábricas", exact: true }).waitFor();
    const list = page.getByRole("region", { name: "Proveedores guardados", exact: true });
    await list.getByRole("heading", { name: "Proveedor 00", exact: true }).waitFor();
    assert.equal(await list.getByRole("listitem").count(), 12);
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    assert.equal(await list.getByRole("listitem").count(), 1);
    assert.ok(await placeholderContrast(page.getByLabel("Buscar en la agenda", { exact: true })) >= 4.5);
    await page.getByLabel("Buscar en la agenda", { exact: true }).fill("talle mas");
    await page.getByLabel("Tipo", { exact: true }).selectOption("fabrica");
    await page.getByLabel("Categoría", { exact: true }).selectOption("Remeras");
    await page.getByLabel("Solo favoritos", { exact: true }).check();
    assert.equal(await list.getByRole("listitem").count(), 1);
    await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await page.evaluate(async () => { window.scrollTo(0,0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.screenshot({ path: `.impeccable/review/suppliers-list-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Agregar proveedor", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Guardar proveedor", exact: true }).isDisabled(), true);
    await page.getByLabel("Nombre del vendedor o fábrica", { exact: true }).fill("Fábrica Álamo");
    await page.getByLabel("Tipo de proveedor", { exact: true }).selectOption("fabrica");
    await page.getByLabel("Categoría de productos", { exact: true }).fill("Buzos");
    await page.getByLabel("Contacto", { exact: true }).fill("WeChat: alamo123");
    await page.getByLabel("Enlace de la tienda o catálogo", { exact: true }).fill("https://example.com/alamo");
    await page.getByLabel("Aclaraciones del proveedor", { exact: true }).fill("Pedir tabla antes de encargar.\nNo mezclar talles de la tanda anterior.");
    await page.getByLabel("Marcar como favorito", { exact: true }).check();
    assert.ok(await placeholderContrast(page.getByLabel("Aclaraciones del proveedor", { exact: true })) >= 4.5);
    await page.evaluate(async () => { window.scrollTo(0,0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.screenshot({ path: `.impeccable/review/suppliers-editor-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Guardar proveedor", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "No se pudo guardar" }).waitFor();
    assert.equal(await page.getByLabel("Aclaraciones del proveedor", { exact: true }).inputValue(), "Pedir tabla antes de encargar.\nNo mezclar talles de la tanda anterior.");
    await page.getByRole("button", { name: "Guardar proveedor", exact: true }).click();
    await page.getByRole("heading", { name: "Vendedores y fábricas", exact: true }).waitFor();
    await page.reload();
    await list.getByRole("heading", { name: "Fábrica Álamo", exact: true }).waitFor();
    await page.getByLabel("Buscar en la agenda", { exact: true }).fill("alamo123");
    await list.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Aclaraciones del proveedor", { exact: true }).fill("Cambio sin guardar");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
    assert.equal(await page.getByLabel("Aclaraciones del proveedor", { exact: true }).inputValue(), "Cambio sin guardar");
    await page.getByRole("navigation", { name: "Secciones de Calculadora", exact: true }).getByRole("link", { name: "Calculadora", exact: true }).click();
    await page.getByRole("dialog", { name: "Salir sin aplicar los cambios", exact: true }).waitFor();
    await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Descartar cambios", exact: true }).click();
    await list.getByRole("button", { name: "Eliminar Fábrica Álamo", exact: true }).click();
    const beforeDelete = writes;
    await page.getByRole("button", { name: "Cancelar", exact: true }).click(); assert.equal(writes, beforeDelete);
    await list.getByRole("button", { name: "Eliminar Fábrica Álamo", exact: true }).click();
    await page.getByRole("button", { name: "Eliminar proveedor", exact: true }).click();
    await page.getByText("No hay proveedores con esos filtros", { exact: true }).waitFor();
    await page.getByRole("navigation", { name: "Secciones de Calculadora", exact: true }).getByRole("link", { name: "Calculadora", exact: true }).click();
    await page.getByRole("link", { name: "Guardar vendedor de Remera de referencia", exact: true }).click();
    await page.getByRole("main", { name: "Agregar proveedor", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Nombre del vendedor o fábrica", { exact: true }).inputValue(), "Textiles del Sur");
    assert.equal(await page.getByLabel("Producto de referencia", { exact: true }).inputValue(), order.url);
    assert.equal(await page.getByLabel("Enlace de la tienda o catálogo", { exact: true }).inputValue(), "");
    const beforeSave = writes; assert.ok(!items.find(item => item.nombre === "Textiles del Sur"));
    await page.getByRole("button", { name: "Guardar proveedor", exact: true }).click();
    await page.getByRole("heading", { name: "Vendedores y fábricas", exact: true }).waitFor();
    assert.equal(writes, beforeSave + 1);
    await page.goto(`${base}/calculadora/proveedores?nuevo=1&nombre=Textiles%20del%20Sur&referencia=${encodeURIComponent(order.url)}`);
    await page.getByRole("main", { name: "Editar proveedor", exact: true }).waitFor();
    assert.equal(items.filter(item => item.nombre === "Textiles del Sur").length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close(); console.log(`Proveedores ${width}px: acceso compartido, filtros, paginación, guardado con reintento, persistencia, descarte, eliminación y alta manual desde CSSBuy OK`);
  }
} finally { await browser.close(); }
