import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const base = { imagen: "", url: "", vendedor: "", variante: "", precio_unitario_cny: 50,
      envio_local_cny: 0, envio_china_cny: 0, cantidad: 1, peso_g: 300, tracking: "", fecha_pedido: 1750000000 };
    const orders = [
      { ...base, oid: "sent", producto: "Remera enviada de prueba", estado: "5" },
      { ...base, oid: "stored", producto: "Buzo almacenado de prueba", estado: "4" },
      { ...base, oid: "invalid", producto: "Pedido inválido de prueba", estado: "6" },
    ];
    await page.addInitScript(data => localStorage.setItem("cssbuy-orders", JSON.stringify(data)), [{ ...orders[0], estado: "3" }, orders[2]]);
    await page.route("**/api/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, orders }) }));
    await page.goto("http://localhost:3001/");
    await page.getByRole("button", { name: "Enviados (1)", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Todos (2)", exact: true }).count(), 1);
    assert.equal(await page.getByText("Pedido inválido de prueba", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Enviados (1)", exact: true }).click();
    assert.equal(await page.getByText("Remera enviada de prueba", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Buzo almacenado de prueba", { exact: true }).count(), 0);
    await page.getByText("Enviado", { exact: true }).waitFor();
    await page.getByRole("button", { name: "En Almacén (1)", exact: true }).click();
    assert.equal(await page.getByText("Buzo almacenado de prueba", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Remera enviada de prueba", { exact: true }).count(), 0);
    await page.getByText("En almacén", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `.impeccable/review/cssbuy-status-${width}.png` });
    await page.close();
    console.log(`CSSBuy estados ${width}px: inválidos fuera, cache actualizado y filtros enviados/almacén OK`);
  }
} finally { await browser.close(); }
