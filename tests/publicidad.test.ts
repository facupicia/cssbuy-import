import { test } from "node:test";
import assert from "node:assert/strict";
import { productAdEconomics, parseSellingCosts, DEFAULT_SELLING_COSTS } from "../src/lib/profitability";
import { normalizeInsight, parseReportRange, getMetaCampaignReport, type MetaInsight } from "../src/lib/meta-report";
import { authorizeIntegration, createReportingSession } from "../src/lib/integration-auth";
import type { InventoryItem } from "../src/lib/types";
import { POST as login, DELETE as logout } from "../src/app/api/publicidad/session/route";

const product: InventoryItem = {
  id: "test", nombre: "Remera", cantidadInicial: 2, cantidadVendida: 0,
  precioVentaARS: 75000, costoUnitARS: 25532, costoUnitUSD: 0,
  estado: "en_deposito", origen: "manual", createdAt: "", updatedAt: "",
};
const insight: MetaInsight = { campaign_id: "123", campaign_name: "Ventas", account_currency: "ARS",
  date_start: "2026-10-10", date_stop: "2026-10-14", spend: "10000", impressions: "2000" };

test("límites descuentan gastos y ganancia objetivo, sin mezclar unidades vendidas", () => {
  const result = productAdEconomics(product, { feePercent: 10, shippingARS: 4000, packagingARS: 1000, targetProfitARS: 15000 });
  assert.equal(result.breakEvenCpaARS, 36968);
  assert.equal(result.targetCpaARS, 21968);
  assert.equal(result.breakEvenRoas, 75000 / 36968);
  assert.equal(result.canAdvertise, true);
  assert.equal(productAdEconomics({ ...product, cantidadVendida: 2 }, DEFAULT_SELLING_COSTS).canAdvertise, false);
  assert.equal(productAdEconomics({ ...product, estado: "en_transito" }, DEFAULT_SELLING_COSTS).canAdvertise, false);
});

test("costos incompletos o margen negativo no inventan equilibrio rentable", () => {
  assert.equal(productAdEconomics({ ...product, costoUnitARS: 0 }, DEFAULT_SELLING_COSTS).breakEvenCpaARS, null);
  const result = productAdEconomics({ ...product, costoUnitARS: 80000 }, DEFAULT_SELLING_COSTS);
  assert.equal(result.breakEvenRoas, null);
  assert.equal(result.targetCpaARS, 0);
  assert.equal(result.canAdvertise, false);
});

test("valida fechas reales, orden, intervalo y supuestos", () => {
  for (const query of ["since=2026-02-30&until=2026-03-01", "since=2026-10-12&until=2026-10-10", "since=2026-01-01&until=2026-12-31", "since=foo&until=bar"]) {
    assert.throws(() => parseReportRange(new URLSearchParams(query)));
  }
  assert.deepEqual(parseReportRange(new URLSearchParams("since=2026-10-10&until=2026-10-14")), { since: "2026-10-10", until: "2026-10-14" });
  for (const query of ["feePercent=101", "shippingARS=-1", "packagingARS=NaN", "targetProfitARS="]) {
    assert.throws(() => parseSellingCosts(new URLSearchParams(query)));
  }
});

test("ausencia de eventos no se convierte en cero; no suma compras omni y pixel", () => {
  assert.equal(normalizeInsight(insight).websitePurchases, null);
  assert.equal(normalizeInsight(insight).roas, null);
  const result = normalizeInsight({ ...insight,
    actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "2" }, { action_type: "omni_purchase", value: "2" }],
    action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "150000" }],
  });
  assert.equal(result.websitePurchases, 2);
  assert.equal(result.cpa, 5000);
  assert.equal(result.roas, 15);
});

test("API rechaza acceso anónimo, clave incorrecta, sesión vencida y manipulación", () => {
  const previous = process.env.BUSINESS_READ_API_KEY;
  const key = "test-key-".repeat(8);
  process.env.BUSINESS_READ_API_KEY = key;
  try {
    const request = (headers: HeadersInit = {}) => new Request("https://test.invalid", { headers });
    assert.equal(authorizeIntegration(request())?.status, 401);
    assert.equal(authorizeIntegration(request({ authorization: "Bearer wrong" }))?.status, 401);
    assert.equal(authorizeIntegration(request({ authorization: `Bearer ${key}` })), null);
    const session = createReportingSession(key);
    assert.equal(authorizeIntegration(request({ cookie: `reporting_session=${session}` })), null);
    assert.equal(authorizeIntegration(request({ cookie: `reporting_session=${session}x` }))?.status, 401);
    assert.equal(authorizeIntegration(request({ cookie: `reporting_session=${createReportingSession(key, Date.now() - 9 * 3600000)}` }))?.status, 401);
    delete process.env.BUSINESS_READ_API_KEY;
    assert.equal(authorizeIntegration(request())?.status, 503);
  } finally {
    if (previous === undefined) delete process.env.BUSINESS_READ_API_KEY;
    else process.env.BUSINESS_READ_API_KEY = previous;
  }
});

test("Meta pagina en host fijo, envía el token en header y rechaza reportes incompletos", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_GRAPH_API_VERSION"] as const;
  const saved = names.map(name => process.env[name]);
  process.env.META_ACCESS_TOKEN = "private-test-token";
  process.env.META_AD_ACCOUNT_ID = "act_123";
  process.env.META_GRAPH_API_VERSION = "v26.0";
  let calls = 0;
  try {
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "graph.facebook.com");
      assert.equal(url.searchParams.has("access_token"), false);
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer private-test-token");
      calls++;
      return Response.json(calls === 1 ? { data: [insight], paging: { next: "https://evil.invalid/", cursors: { after: "cursor2" } } } : { data: [{ ...insight, campaign_id: "456" }] });
    };
    assert.equal((await getMetaCampaignReport({ since: "2026-10-10", until: "2026-10-14" })).length, 2);
    assert.equal(calls, 2);
    globalThis.fetch = async () => Response.json({ data: [insight], paging: { next: "ignored" } });
    await assert.rejects(getMetaCampaignReport({ since: "2026-10-10", until: "2026-10-14" }), /paginación/);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
  }
});

test("ingreso exige origen permitido y contraseña, devuelve cookie HttpOnly y permite cierre", async () => {
  const previous = [process.env.BUSINESS_READ_API_KEY, process.env.ADMIN_PASSWORD, process.env.BUSINESS_APP_ORIGIN];
  process.env.BUSINESS_READ_API_KEY = "test-private-key-".repeat(4);
  process.env.ADMIN_PASSWORD = "test-private-admin-password";
  process.env.BUSINESS_APP_ORIGIN = "https://panel.invalid";
  const request = (origin: string, password: string) => new Request("http://internal:3001/api/publicidad/session", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ password }),
  });
  try {
    assert.equal((await login(request("https://evil.invalid", process.env.ADMIN_PASSWORD))).status, 403);
    assert.equal((await login(request("https://panel.invalid", "wrong"))).status, 401);
    const result = await login(request("https://panel.invalid", process.env.ADMIN_PASSWORD));
    assert.equal(result.status, 200);
    const cookie = result.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    assert.doesNotMatch(await result.text(), /test-private/);
    assert.equal(authorizeIntegration(new Request("https://panel.invalid/api/integraciones/costos", { headers: { cookie: cookie.split(";")[0] } })), null);
    const closed = await logout(new Request("http://internal:3001/api/publicidad/session", { method: "DELETE", headers: { origin: "https://panel.invalid" } }));
    assert.match(closed.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  } finally {
    ["BUSINESS_READ_API_KEY", "ADMIN_PASSWORD", "BUSINESS_APP_ORIGIN"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    });
  }
});
