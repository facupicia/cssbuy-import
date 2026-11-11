import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

// Disposable database and test account; never use the business database or CSSBuy account.
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const port = await freePort(), pgPort = await freePort(), base = `http://localhost:${port}`;
const database = new EmbeddedPostgres({ databaseDir: await mkdtemp(join(tmpdir(), "plug-plans-ui-")), port: pgPort, user: "postgres", password: "local-test-only", persistent: false, onLog() {}, onError() {}, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
let app, browser;
try {
  await database.initialise(); await database.start();
  console.log("Base de prueba iniciada");
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { windowsHide: true, env: { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(pgPort), PGUSER: "postgres", PGPASSWORD: "local-test-only", PGDATABASE: "postgres", ADMIN_PASSWORD: "isolated-test-bootstrap-key", BUSINESS_APP_ORIGIN: base, BETTER_AUTH_SECRET: "isolated-test-only-secret-32-characters", TIENDANUBE_ACCESS_TOKEN: "", META_ACCESS_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; app.stdout.on("data", chunk => { output += chunk; }); app.stderr.on("data", chunk => { output += chunk; });
  for (let i = 0; i < 80; i++) {
    if (app.exitCode !== null) throw new Error(output);
    try { if ((await fetch(`${base}/ingresar`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const signup = await fetch(`${base}/api/admin/bootstrap`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ name: "Fixture", email: "fixture@example.com", password: "isolated-test-personal-password", adminPassword: "isolated-test-bootstrap-key", rememberMe: true }) });
  assert.equal(signup.status, 200, await signup.text());
  console.log("Cuenta de prueba creada");
  const cookies = signup.headers.getSetCookie().map(cookie => cookie.split(";")[0]).filter(cookie => !cookie.endsWith("="));
  const url = "https://www.cssbuy.com/shop/goodsDetail?id=1029556292572&type=1688";
  async function seed(path, body) {
    const response = await fetch(base + path, { method: "POST", headers: { origin: base, cookie: cookies.join("; "), "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
  }
  browser = await chromium.launch({ headless: true });
  await mkdir(".impeccable/review", { recursive: true });
  for (const width of [1365, 390]) {
    const original = `https://detail.1688.com/offer/${width}12345.html`;
    await seed("/api/proveedores", { nombre: `Proveedor de prueba ${width}`, tipo: "fabrica", categoria: "Remeras", tiendaUrl: `https://example.com/catalogo/${width}`, referenciaUrl: original, contacto: "", notas: "", favorito: false });
    const { item: stock } = await seed("/api/inventario", { nombre: `Prenda guardada ${width}`, variante: "XL · Azul", link: original, cantidadInicial: 3, cantidadVendida: 0, costoUnitARS: 20000, precioVentaARS: 60000, origen: "manual", estado: "en_deposito" });
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies(cookies.map(cookie => { const index = cookie.indexOf("="); return { name: cookie.slice(0, index), value: cookie.slice(index + 1), url: base }; }));
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/dolarapi\.com|open\.er-api\.com/, route => route.abort());
    await page.goto(base);
    await page.getByRole("link", { name: "Próximos pedidos", exact: true }).click();
    console.log(`${width}px: página cargada`);
    await page.getByRole("button", { name: "Crear pedido", exact: true }).click();
    await page.getByLabel("Nombre del pedido").fill(`Pedido de prueba ${width}`);
    await page.getByLabel("Enlace del producto").fill(url);
    await page.getByRole("button", { name: "Agregar producto", exact: true }).click();
    let line = page.getByRole("article", { name: "Producto 1", exact: true });
    await line.getByLabel("Producto", { exact: true }).fill("Remera de prueba");
    await line.getByLabel("Talle y color").fill("L · Negro");
    await line.getByLabel("Cantidad", { exact: true }).fill("2");
    await line.getByLabel("Precio unitario CNY").fill("70");
    await line.getByLabel("Envío China total CNY").fill("14");
    // Browser Back must leave the dirty editor in place until explicitly discarded.
    await page.evaluate(() => history.back());
    await page.getByRole("dialog", { name: "Salir sin guardar el pedido" }).waitFor();
    await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
    assert.equal(await line.getByLabel("Cantidad", { exact: true }).inputValue(), "2");
    // A save failure must take focus to visible feedback, even from a scrolled editor.
    await page.route(`${base}/api/compras`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fallo de guardado simulado" }) }));
    await page.getByRole("button", { name: "Guardar pedido", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Fallo de guardado simulado" }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "alert");
    await page.unroute(`${base}/api/compras`);
    await page.getByRole("button", { name: "Guardar pedido", exact: true }).click();
    await page.getByText("Pedido guardado. Podés retomarlo", { exact: false }).waitFor();
    await page.reload();
    await page.getByRole("article").filter({ hasText: `Pedido de prueba ${width}` }).getByRole("button", { name: "Abrir pedido" }).click();
    line = page.getByRole("article", { name: "Producto 1", exact: true });
    assert.equal(await line.getByLabel("Cantidad", { exact: true }).inputValue(), "2");
    await line.getByLabel("Peso estimado por unidad (g)").fill("300");
    await line.getByLabel("Venta prevista por unidad ARS").fill("60000");
    await page.getByLabel("Pesos por dólar").fill("1400");
    await page.getByLabel("Yuanes por dólar").fill("7");
    await page.getByLabel("Flete internacional USD").fill("30");
    await page.getByLabel("Impuestos estimados USD").fill("12");
    await page.getByLabel("Otros gastos USD").fill("2");
    await page.getByLabel("Presupuesto máximo ARS").fill("50000");
    await page.getByRole("button", { name: "Otra variante", exact: true }).click();
    const second = page.getByRole("article", { name: "Producto 2", exact: true });
    await second.getByLabel("Producto", { exact: true }).fill("Buzo de prueba");
    await second.getByLabel("Talle y color").fill("M · Blanco");
    await second.getByLabel("Precio unitario CNY").fill("140");
    await second.getByLabel("Peso estimado por unidad (g)").fill("600");
    await second.getByLabel("Envío China total CNY").fill("7");
    await second.getByLabel("Venta prevista por unidad ARS").fill("80000");
    await page.getByLabel("Estado", { exact: true }).selectOption("listo");
    await page.getByRole("button", { name: "Guardar pedido", exact: true }).click();
    await page.getByText("Pedido guardado. Podés retomarlo", { exact: false }).waitFor();
    const summary = page.getByRole("region", { name: "Estimación del pedido", exact: true });
    await summary.getByText("$127.365,00", { exact: true }).waitFor();
    await summary.getByText("Supera tu presupuesto", { exact: false }).waitFor();
    const saved = await page.evaluate(async () => (await (await fetch("/api/compras")).json()).pedidos);
    const record = saved.find(plan => plan.nombre === `Pedido de prueba ${width}`);
    assert.equal(record.estado, "listo"); assert.equal(record.lineas.length, 2);
    assert.equal(record.lineas[0].cantidad, 2); assert.equal(record.lineas[0].envioChinaCNY, 14);
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.impeccable/review/purchase-plans-${width}.png`, fullPage: true });
    await page.getByLabel("Notas del pedido").fill("Cambio que se va a descartar");
    await page.evaluate(() => history.back());
    await page.getByRole("dialog", { name: "Salir sin guardar el pedido" }).waitFor();
    await page.getByRole("button", { name: "Descartar y volver", exact: true }).click();
    await page.waitForURL(`${base}/`);
    await page.getByRole("link", { name: "Próximos pedidos", exact: true }).click();
    await page.getByRole("article").filter({ hasText: `Pedido de prueba ${width}` }).getByRole("button", { name: "Abrir pedido" }).click();
    assert.equal(await page.getByLabel("Notas del pedido").inputValue(), "");
    // The root calculator uses the same disposable database; all exchange-rate requests are blocked.
    await page.getByRole("button", { name: "Abrir en calculadora", exact: true }).click();
    await page.waitForURL(`${base}/`);
    await page.locator('input[value="Remera de prueba · L · Negro"]:visible').waitFor();
    await page.locator('input[value="Buzo de prueba · M · Blanco"]:visible').waitFor();
    await page.getByRole("link", { name: "Próximos pedidos", exact: true }).click();
    await page.getByRole("button", { name: "Crear pedido", exact: true }).click();
    await page.getByLabel("Nombre del pedido").fill(`Desde guardados ${width}`);
    await page.getByRole("button", { name: "Elegir de mis enlaces guardados", exact: true }).click();
    const picker = page.getByRole("region", { name: "Enlaces guardados", exact: true });
    await picker.getByLabel("Buscar producto o proveedor").fill(`Proveedor de prueba ${width}`);
    await picker.getByRole("checkbox", { name: new RegExp(`Producto de referencia · Proveedor de prueba ${width}`) }).check();
    assert.equal(await picker.getByRole("checkbox").count(), 1, "el catálogo no se selecciona como producto");
    await picker.getByLabel("Buscar en", { exact: true }).selectOption("inventario");
    await picker.getByLabel("Buscar producto o proveedor").fill(`Prenda guardada ${width}`);
    await picker.getByRole("checkbox", { name: new RegExp(`Prenda guardada ${width}`) }).check();
    await picker.getByLabel("Buscar producto o proveedor").fill("no-hay-este-producto");
    await picker.getByText("No hay enlaces que coincidan con esa búsqueda.").waitFor();
    await picker.getByLabel("Buscar en", { exact: true }).selectOption("proveedores");
    await picker.getByLabel("Buscar producto o proveedor").fill(`Proveedor de prueba ${width}`);
    await picker.getByText("2 productos seleccionados", { exact: false }).waitFor();
    await page.getByText("Cotización cargada con éxito", { exact: true }).waitFor({ state: "hidden" });
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.impeccable/review/saved-links-${width}.png`, fullPage: true });
    await picker.getByRole("button", { name: "Agregar seleccionados (2)", exact: true }).click();
    assert.equal(await page.getByRole("article").count(), 2);
    const referenceLine = page.getByRole("article", { name: "Producto 1", exact: true });
    const inventoryLine = page.getByRole("article", { name: "Producto 2", exact: true });
    assert.equal(await referenceLine.getByLabel("Producto", { exact: true }).inputValue(), "");
    assert.equal(await inventoryLine.getByLabel("Producto", { exact: true }).inputValue(), `Prenda guardada ${width}`);
    assert.equal(await inventoryLine.getByLabel("Talle y color").inputValue(), "XL · Azul");
    assert.equal(await inventoryLine.getByLabel("Cantidad", { exact: true }).inputValue(), "1");
    assert.equal(await inventoryLine.getByLabel("Precio unitario CNY").inputValue(), "");
    assert.equal(await inventoryLine.getByLabel("Peso estimado por unidad (g)").inputValue(), "");
    await page.getByRole("button", { name: "Guardar pedido", exact: true }).click();
    await page.getByText("Pedido guardado. Podés retomarlo", { exact: false }).waitFor();
    await page.reload();
    await page.getByRole("article").filter({ hasText: `Desde guardados ${width}` }).getByRole("button", { name: "Abrir pedido" }).click();
    assert.equal(await page.getByRole("article").count(), 2);
    const unchanged = await page.evaluate(async id => (await (await fetch('/api/inventario')).json()).items.find(item => item.id === id), stock.id);
    assert.equal(unchanged.cantidadInicial, 3); assert.equal(unchanged.cantidadVendida, 0);
    assert.deepEqual(errors, []);
    await context.close(); console.log(`${width}px: crear, guardar, recargar, variantes, cantidades, costos y traspaso verificados`);
  }
} catch (error) {
  console.error(error); throw error;
} finally {
  if (browser) await browser.close();
  if (app && app.exitCode === null) { const ended = new Promise(resolve => app.once("exit", resolve)); app.kill(); await ended; }
  await database.stop();
}
