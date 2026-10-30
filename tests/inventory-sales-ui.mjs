import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";

// Real HTTP and authentication against a disposable local database only.
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const port = await freePort(), pgPort = await freePort(), base = `http://localhost:${port}`;
const database = new EmbeddedPostgres({ databaseDir: await mkdtemp(join(tmpdir(), "plug-sales-ui-")), port: pgPort, user: "postgres", password: "local-test-only", persistent: false, onLog() {}, onError() {}, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
let app, browser;
try {
  await database.initialise(); await database.start();
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { windowsHide: true, env: { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(pgPort), PGUSER: "postgres", PGPASSWORD: "local-test-only", PGDATABASE: "postgres", ADMIN_PASSWORD: "isolated-test-bootstrap-key", BUSINESS_APP_ORIGIN: base, BETTER_AUTH_SECRET: "isolated-test-only-secret-32-characters", TIENDANUBE_ACCESS_TOKEN: "", META_ACCESS_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let appOutput = "";
  app.stdout.on("data", c => { appOutput += c; }); app.stderr.on("data", c => { appOutput += c; });
  for (let i = 0; i < 80; i++) {
    if (app.exitCode !== null) throw new Error(appOutput);
    try { if ((await fetch(`${base}/ingresar`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const signup = await fetch(`${base}/api/admin/bootstrap`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ name: "Fixture", email: "fixture@example.com", password: "isolated-test-personal-password", adminPassword: "isolated-test-bootstrap-key", rememberMe: true }) });
  assert.equal(signup.status, 200, await signup.text());
  const cookies = signup.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("="));
  const cookie = cookies.join("; ");
  async function api(path, body, method = body ? "POST" : "GET") {
    const response = await fetch(`${base}${path}`, { method, headers: { origin: base, cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  }
  browser = await chromium.launch({ headless: true });
  await mkdir(".impeccable/review", { recursive: true });
  for (const width of [1365, 390]) {
    const { item } = await api("/api/inventario", { nombre: `Remera fixture ${width}`, cantidadInicial: 5, cantidadVendida: 2, precioVentaARS: 75000, costoUnitARS: 25000, origen: "manual", estado: "en_deposito" });
    await api("/api/inventario/ventas", { requestId: randomUUID(), itemId: item.id, fecha: "2025-08-31", unidades: 1, precioUnitARS: 55000, anterior: true });
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies(cookies.map(c => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: base }; }));
    const page = await context.newPage(); const errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/inventario`);
    const section = page.getByRole("region", { name: "Facturación por mes" });
    await section.getByLabel("Mes a consultar").fill("2025-07");
    await section.getByText("No hay ventas con fecha registrada en este mes.", { exact: false }).waitFor();
    await section.locator("summary").filter({ hasText: "unidades vendidas sin fecha" }).click();
    await section.getByRole("button", { name: `Completar venta de ${item.nombre}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Fecha de venta").fill("2025-09-01");
    await dialog.getByLabel("Precio cobrado por unidad ARS").fill("60000");
    assert.equal(await dialog.getByRole("button", { name: "Guardar fecha e importe" }).isDisabled(), true);
    await dialog.getByLabel("Confirmo que el precio ingresado es el que cobré en esa venta.").check();
    await dialog.getByRole("button", { name: "Guardar fecha e importe" }).click();
    await dialog.waitFor({ state: "hidden" });
    if (width >= 768) {
      await page.getByRole("button", { name: `Más acciones de ${item.nombre}`, exact: true }).filter({ visible: true }).click();
      await page.getByRole("menuitem", { name: "Registrar venta" }).click();
    } else await page.getByRole("button", { name: "Registrar venta", exact: true }).filter({ visible: true }).first().click();
    await dialog.getByLabel("Fecha de venta").fill("2025-09-30");
    await dialog.getByLabel("Precio cobrado por unidad ARS").fill("70000.50");
    await page.screenshot({ path: `.impeccable/review/inventory-sale-dialog-${width}.png` });
    await dialog.getByRole("button", { name: "Registrar venta", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const saved = (await api(`/api/inventario/${item.id}`)).item;
    assert.equal(saved.cantidadVendida, 3); assert.equal(saved.precioVentaARS, 75000);
    await api(`/api/inventario/${item.id}`, { precioVentaARS: 99000 }, "PATCH");
    await section.getByLabel("Mes a consultar").fill("2025-09");
    await section.getByRole("cell", { name: "30/09/2025" }).first().waitFor();
    const report = await api("/api/inventario/ventas?mes=2025-09");
    assert.equal(report.ventas.filter(s => s.nombre === item.nombre).reduce((sum, sale) => sum + sale.totalARS, 0), 130000.50);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.waitForTimeout(4200); // Success toasts must not cover the captured content.
    await page.screenshot({ path: `.impeccable/review/inventory-sales-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}px: mes vacío, fecha anterior, nueva venta, precio histórico y stock verificados`);
  }
} finally {
  if (browser) await browser.close();
  if (app && app.exitCode === null) { const ended = new Promise(resolve => app.once("exit", resolve)); app.kill(); await ended; }
  await database.stop();
}
