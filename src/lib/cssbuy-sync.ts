import path from "path";
import fs from "fs";
import crypto from "crypto";
import { ensureCssbuyOrdersTable, upsertCssbuyOrders, type CssbuyOrderRow } from "./db";

const SESSION_FILE = path.join(process.cwd(), ".cssbuy-session.json");

export interface SyncResult {
  ok: boolean;
  total: number;
  inserted: number;
  updated: number;
  message: string;
}

export interface SyncOptions {
  startDate?: string;
  endDate?: string;
}

type LogFn = (msg: string) => void;

// ---------------------------------------------------------------------------
// Helpers de detección de datos
// ---------------------------------------------------------------------------

const ID_KEYS = ["oid", "order_sn", "ordersn", "orderSn", "order_no", "orderNo", "orderid", "order_id", "id"];

export function isValidOrder(item: RawItem): boolean {
  if (!item || typeof item !== "object") return false;
  const s = item.state ?? item.status ?? item.orderState ?? item.order_state ?? item.goods_status ?? item.order_status ?? item.pay_status ?? item.cancel_status ?? item.refund_status;
  const sStr = s != null ? String(s).trim() : "";
  if (sStr === "0" || sStr === "-1" || sStr === "7" || sStr === "8" || sStr === "9" || sStr === "10") return false;

  const isDel = item.is_del ?? item.isdel ?? item.is_delete ?? item.deleted;
  if (String(isDel) === "1" || String(isDel) === "true") return false;

  const cancelStatus = item.cancel_status ?? item.cancelStatus;
  if (String(cancelStatus) === "1" || String(cancelStatus) === "2") return false;

  const refundStatus = item.refund_status ?? item.refundStatus;
  if (String(refundStatus) === "1" || String(refundStatus) === "2") return false;

  const stateName = toStr(
    getPath(item, [
      "statename", "status_name", "statusName", "state_name", "stateName", "status", "state", "orderState", "order_state", "remark",
    ])
  )?.toLowerCase() || "";

  if (
    !stateName ||
    stateName === "0" ||
    stateName === "-1" ||
    stateName === "7" ||
    stateName === "8" ||
    stateName === "9" ||
    stateName === "10" ||
    stateName.includes("invalid") ||
    stateName.includes("inválid") ||
    stateName.includes("invalida") ||
    stateName.includes("invalido") ||
    stateName.includes("cancel") ||
    stateName.includes("cancelled") ||
    stateName.includes("canceled") ||
    stateName.includes("cancelado") ||
    stateName.includes("cancelada") ||
    stateName.includes("refund") ||
    stateName.includes("refunded") ||
    stateName.includes("reembols") ||
    stateName.includes("return") ||
    stateName.includes("returned") ||
    stateName.includes("devuelto") ||
    stateName.includes("devoluc") ||
    stateName.includes("close") ||
    stateName.includes("closed") ||
    stateName.includes("cerrado") ||
    stateName.includes("cerrada") ||
    stateName.includes("reject") ||
    stateName.includes("unpaid") ||
    stateName.includes("non-payment") ||
    stateName.includes("out of stock") ||
    stateName.includes("sin stock") ||
    stateName.includes("agotado") ||
    stateName.includes("expired") ||
    stateName.includes("fail") ||
    stateName.includes("problem") ||
    stateName.includes("after sales") ||
    stateName.includes("after-sales") ||
    stateName.includes("无效") ||
    stateName.includes("已取消") ||
    stateName.includes("取消") ||
    stateName.includes("退款") ||
    stateName.includes("已退款") ||
    stateName.includes("退货") ||
    stateName.includes("已退货") ||
    stateName.includes("关闭") ||
    stateName.includes("已关闭") ||
    stateName.includes("失效") ||
    stateName.includes("已失效") ||
    stateName.includes("缺货") ||
    stateName.includes("未付款") ||
    stateName.includes("异常") ||
    stateName.includes("删除") ||
    stateName.includes("拒绝") ||
    stateName.includes("失败")
  ) {
    return false;
  }
  return true;
}

function isInDateRange(date: Date | null, startDate?: string, endDate?: string): boolean {
  if (!date || (!startDate && !endDate)) return true;
  const time = date.getTime();
  if (startDate) {
    const startTs = new Date(`${startDate}T00:00:00Z`).getTime() - 24 * 3600 * 1000;
    if (time < startTs) return false;
  }
  if (endDate) {
    const endTs = new Date(`${endDate}T23:59:59Z`).getTime() + 24 * 3600 * 1000;
    if (time > endTs) return false;
  }
  return true;
}

type RawItem = Record<string, unknown>;

function stableKey(item: RawItem): string {
  for (const k of ID_KEYS) {
    const v = item[k];
    if (v != null && String(v) !== "") return String(v);
  }
  return "hash:" + crypto.createHash("md5").update(JSON.stringify(item)).digest("hex");
}

function pick(item: RawItem, keys: string[]): unknown {
  for (const k of keys) {
    if (item[k] != null && item[k] !== "") return item[k];
  }
  return undefined;
}

// Soporta claves planas y rutas anidadas (p.ej. "orderGoods.name")
function getPath(item: RawItem, paths: string[]): unknown {
  for (const p of paths) {
    if (p.includes(".")) {
      const v = p.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as RawItem)[k]), item);
      if (v != null && v !== "") return v;
    } else if (item[p] != null && item[p] !== "") {
      return item[p];
    }
  }
  return undefined;
}

function toStr(v: unknown): string | null {
  return v == null ? null : String(v);
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  const n = toNum(v);
  if (!n) return null;
  return new Date(n > 1e12 ? n : n * 1000);
}

function toRow(item: RawItem): CssbuyOrderRow {
  const total = toNum(
    getPath(item, [
      "totalPrice", "totalprice", "totalmoney", "total", "amount", "ordermoney", "money",
      "total_price", "paymoney", "consumption", "goodsprice", "goods_price", "price", "unit_price",
    ])
  );
  return {
    order_no: stableKey(item),
    status: toStr(
      getPath(item, [
        "state", "stateName", "statename", "status", "status_name", "orderState", "order_state",
      ])
    ),
    title: toStr(
      getPath(item, [
        "orderGoods.name", "orderGoods.nameCn", "goodsname", "goods_name", "title", "name",
        "order_title", "product_name", "remark",
      ])
    ),
    total_cny: total,
    currency:
      toStr(getPath(item, ["currency", "moneytype", "money_type"])) ??
      (total != null ? "CNY" : null),
    tracking: toStr(
      getPath(item, [
        "orderLogistics.expressTrackingNo", "orderLogistics.expressNo",
        "expressno", "express_no", "tracking", "tracking_no", "trackno", "logisticsno", "deliveryno",
      ])
    ),
    order_date: toDate(
      getPath(item, [
        "purchaseTime", "createTime", "addtime", "add_time", "createtime", "create_time",
        "ctime", "order_time", "paytime", "pay_time",
      ])
    ),
    raw: item,
  };
}

// ---------------------------------------------------------------------------
// CSSBuy Direct API Sync (sin Playwright)
// ---------------------------------------------------------------------------

interface CssbuyLoginResult {
  token: string;
  cookies: Record<string, string>;
}

/**
 * Intenta login en la API web de CSSBuy y retorna un token JWT + cookies de sesión.
 * Prueba múltiples endpoints conocidos.
 */
async function cssbuyLogin(user: string, pass: string, log: LogFn): Promise<CssbuyLoginResult> {
  // Leer cookies existentes del session file si hay
  let existingCookies: Record<string, string> = {};
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const sess = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      if (Array.isArray(sess.cookies)) {
        for (const c of sess.cookies) {
          if (c.domain?.includes("cssbuy.com")) {
            existingCookies[c.name] = c.value;
          }
        }
      }
      // Leer tokens de localStorage del session guardado
      if (Array.isArray(sess.origins)) {
        for (const origin of sess.origins) {
          if (Array.isArray(origin.localStorage)) {
            for (const item of origin.localStorage) {
              if (item.name === "css-token" && item.value) {
                return { token: item.value, cookies: existingCookies };
              }
              if (item.name === "userInfo") {
                try {
                  const u = JSON.parse(item.value);
                  if (u.token) return { token: u.token, cookies: existingCookies };
                } catch {}
              }
            }
          }
        }
      }
    } catch {}
  }

  // Endpoints de login conocidos de CSSBuy
  const loginEndpoints = [
    {
      url: "https://www.cssbuy.com/api/user/login",
      bodyFn: () => JSON.stringify({ account: user, password: pass }),
      contentType: "application/json",
    },
    {
      url: "https://www.cssbuy.com/login",
      bodyFn: () => {
        const params = new URLSearchParams();
        params.set("loginname", user);
        params.set("password", pass);
        return params.toString();
      },
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    },
    {
      url: "https://www.cssbuy.com/web/login",
      bodyFn: () => {
        const params = new URLSearchParams();
        params.set("loginname", user);
        params.set("password", pass);
        return params.toString();
      },
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    },
  ];

  const cookieHeader = Object.entries(existingCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  for (const ep of loginEndpoints) {
    try {
      log(`Probando login en ${ep.url}...`);
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": ep.contentType,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: ep.bodyFn(),
        redirect: "manual",
      });

      // Recoger cookies de respuesta
      const setCookies = res.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const match = sc.match(/^([^=]+)=([^;]*)/);
        if (match) existingCookies[match[1]] = match[2];
      }

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        log(`  → Respuesta no-JSON (status ${res.status})`);
        continue;
      }

      // Buscar token en la respuesta
      const token =
        data?.token ||
        data?.data?.token ||
        data?.data?.css_token ||
        data?.css_token ||
        data?.access_token ||
        data?.data?.access_token ||
        "";

      if (token) {
        log(`  → Login OK, token obtenido`);
        return { token: String(token), cookies: existingCookies };
      }

      // Algunos endpoints retornan success sin token explícito
      if (data?.code === 0 || data?.code === 200 || data?.status === "success" || data?.ok) {
        log(`  → Login OK (sin token explícito, usando cookies)`);
        return { token: "", cookies: existingCookies };
      }

      log(`  → Login rechazado: ${data?.msg || data?.message || JSON.stringify(data).substring(0, 200)}`);
    } catch (e: any) {
      log(`  → Error de red: ${e.message}`);
    }
  }

  throw new Error(
    "No se pudo iniciar sesión en CSSBuy. Verificá CSSBUY_USER / CSSBUY_PASS en .env.local. " +
    "Si CSSBuy requiere captcha, usá el Scraper de Consola y cargá el archivo orders.json manualmente."
  );
}

/**
 * Llama directamente al endpoint de órdenes de CSSBuy desde Node.js (sin browser).
 */
async function fetchOrdersViaAPI(
  token: string,
  cookies: Record<string, string>,
  log: LogFn,
  options: SyncOptions = {}
): Promise<RawItem[]> {
  const P = 50;
  const M = 2000;
  const all: RawItem[] = [];

  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Referer: "https://www.cssbuy.com/shop/cate/order",
    Origin: "https://www.cssbuy.com",
  };
  if (cookieHeader) baseHeaders["Cookie"] = cookieHeader;
  if (token) {
    baseHeaders["Authorization"] = "Bearer " + token;
    baseHeaders["token"] = token;
    baseHeaders["css-token"] = token;
  }

  // Probar múltiples endpoints de órdenes
  const orderEndpoints = [
    "https://www.cssbuy.com/web/order",
    "https://www.cssbuy.com/api/order/list",
    "https://www.cssbuy.com/api/user/order",
  ];

  for (const endpoint of orderEndpoints) {
    log(`Intentando obtener órdenes de ${endpoint}...`);
    let pn = 1;
    let hasMore = true;
    const epItems: RawItem[] = [];

    while (hasMore) {
      try {
        const params = new URLSearchParams();
        params.set("orderState", "all");
        params.set("starttime", options.startDate || "");
        params.set("endtime", options.endDate || "");
        params.set("sTime", options.startDate || "");
        params.set("eTime", options.endDate || "");
        params.set("pageSize", String(P));
        params.set("pageNum", String(pn));
        params.set("page", String(pn));
        params.set("limit", String(P));
        params.set("query", "");
        params.set("inchina", "");
        params.set("status", "all");
        params.set("state", "all");

        const res = await fetch(endpoint, {
          method: "POST",
          headers: baseHeaders,
          body: params.toString(),
        });

        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          log(`  → Respuesta no-JSON (status ${res.status}), probando siguiente endpoint...`);
          break;
        }

        // Si no estamos autenticados
        if (res.status === 401 || res.status === 403 || data?.code === 401 || data?.code === 403) {
          log(`  → No autenticado (${res.status}), probando siguiente endpoint...`);
          break;
        }

        // Buscar la lista de órdenes en la respuesta
        const list =
          (data?.list as unknown[]) ??
          (data?.orders as unknown[]) ??
          (data?.data?.list as unknown[]) ??
          (data?.data?.orders as unknown[]) ??
          (data?.data?.records as unknown[]) ??
          (data?.data?.data as unknown[]) ??
          (data?.data?.rows as unknown[]) ??
          (data?.rows as unknown[]) ??
          (Array.isArray(data?.data) ? (data.data as unknown[]) : null) ??
          (Array.isArray(data) ? (data as unknown[]) : null);

        if (!Array.isArray(list) || list.length === 0) {
          if (pn === 1) {
            log(`  → No hay datos en la respuesta, probando siguiente endpoint...`);
          } else {
            log(`  → Fin de órdenes en página ${pn}`);
          }
          break;
        }

        // Extraer items, incluyendo sub-items de goods_list
        for (const it of list) {
          if (!it || typeof it !== "object") continue;
          const rawObj = it as RawItem;
          const subItems = (
            rawObj.goods_list || rawObj.goods || rawObj.items ||
            rawObj.order_goods || rawObj.order_items || rawObj.child_orders ||
            rawObj.detail_list
          ) as unknown[];

          if (Array.isArray(subItems) && subItems.length > 0) {
            for (const sub of subItems) {
              if (sub && typeof sub === "object") {
                epItems.push({
                  ...rawObj,
                  ...(sub as RawItem),
                  parent_order_sn: rawObj.order_sn || rawObj.oid || rawObj.id,
                });
              }
            }
          } else {
            epItems.push(rawObj);
          }
        }

        log(`  → Pág ${pn}: ${list.length} registros (total acumulado: ${epItems.length})`);
        hasMore = list.length >= P && epItems.length < M;
        if (hasMore) pn++;
      } catch (e: any) {
        log(`  → Error en página ${pn}: ${e.message}`);
        break;
      }
    }

    if (epItems.length > 0) {
      log(`  ✅ ${endpoint} devolvió ${epItems.length} órdenes`);
      all.push(...epItems);
      break; // Ya tenemos datos, no probar más endpoints
    }
  }

  return all;
}

// ---------------------------------------------------------------------------
// Importación directa desde JSON (sin login, para orders.json subidos)
// ---------------------------------------------------------------------------

export function rawItemsToRows(items: RawItem[]): CssbuyOrderRow[] {
  const validItems = items.filter(isValidOrder);
  const unique = new Map<string, RawItem>();
  for (const it of validItems) unique.set(stableKey(it), it);
  return [...unique.values()].map(toRow);
}

// ---------------------------------------------------------------------------
// Flujo principal
// ---------------------------------------------------------------------------

export async function syncCssbuyOrders(
  optionsOrLog?: SyncOptions | LogFn,
  maybeLog?: LogFn
): Promise<SyncResult> {
  let options: SyncOptions = {};
  let log: LogFn = () => {};
  if (typeof optionsOrLog === "function") {
    log = optionsOrLog;
  } else if (optionsOrLog && typeof optionsOrLog === "object") {
    options = optionsOrLog;
    if (typeof maybeLog === "function") log = maybeLog;
  }

  const user = process.env.CSSBUY_USER || "";
  const pass = process.env.CSSBUY_PASS || "";
  if (!user || !pass) {
    throw new Error("Faltan CSSBUY_USER / CSSBUY_PASS en .env.local");
  }

  await ensureCssbuyOrdersTable();

  // 1. Intentar login directo via API (sin Playwright)
  log("🔐 Intentando login via API directa (sin navegador)...");
  let token = "";
  let cookies: Record<string, string> = {};
  try {
    const loginResult = await cssbuyLogin(user, pass, log);
    token = loginResult.token;
    cookies = loginResult.cookies;
  } catch (e: any) {
    log(`⚠️ Login API fallido: ${e.message}`);
    log("Intentando con Playwright como fallback...");
    return syncViaPlaywright(user, pass, log, options);
  }

  // 2. Obtener órdenes via API directa y filtrar inválidas / rango de fechas
  log("📦 Obteniendo órdenes via API...");
  const rawItems = await fetchOrdersViaAPI(token, cookies, log, options);
  const items = rawItems
    .filter(isValidOrder)
    .filter((it) =>
      isInDateRange(
        toDate(
          getPath(it, [
            "purchaseTime", "createTime", "addtime", "add_time", "createtime", "create_time",
            "ctime", "order_time", "paytime", "pay_time",
          ])
        ),
        options.startDate,
        options.endDate
      )
    );

  if (items.length === 0) {
    log("⚠️ API directa no devolvió órdenes válidas. Intentando con Playwright...");
    return syncViaPlaywright(user, pass, log, options);
  }

  // 3. Dedup y guardar en DB
  const unique = new Map<string, RawItem>();
  for (const it of items) unique.set(stableKey(it), it);
  const rows = [...unique.values()].map(toRow);

  const { inserted, updated } = await upsertCssbuyOrders(rows);
  const dateRangeStr = options.startDate && options.endDate ? ` (${options.startDate} a ${options.endDate})` : "";
  const message = `Sync completo: ${rows.length} órdenes válidas${dateRangeStr} (${inserted} nuevas, ${updated} actualizadas)`;
  log(`✅ ${message}`);
  return { ok: true, total: rows.length, inserted, updated, message };
}

// ---------------------------------------------------------------------------
// Fallback: Playwright (para cuando la API directa no funciona)
// ---------------------------------------------------------------------------

async function syncViaPlaywright(
  user: string,
  pass: string,
  log: LogFn,
  options: SyncOptions = {}
): Promise<SyncResult> {
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch (e) {
    // El mensaje viejo decía siempre "Playwright no está instalado", que en el
    // contenedor era falso: el paquete está, pero el build standalone de Next
    // copia playwright-core sin sus archivos de datos (browsers.json) y además
    // no hay Chromium. Distinguimos los casos para no mandar a instalar de más.
    const detalle = e instanceof Error ? e.message : String(e);
    const enContenedor = fs.existsSync("/.dockerenv");

    if (enContenedor) {
      throw new Error(
        "El sync automático no puede correr en el servidor: CSSBuy está detrás de " +
        "Cloudflare y exige un navegador real que resuelva su desafío. " +
        "Corré el sync desde tu PC (npm run dev y el botón Sync, o npm run sync): " +
        "escribe en la misma base que lee el servidor, así que los pedidos " +
        "aparecen acá igual. " +
        `Detalle técnico: ${detalle}`
      );
    }

    throw new Error(
      "No se pudo cargar Playwright. Instalá el navegador con: npx playwright install chromium. " +
      "Mientras tanto, usá el Scraper de Consola y cargá orders.json manualmente. " +
      `Detalle: ${detalle}`
    );
  }

  type Browser = import("playwright").Browser;
  type BrowserContext = import("playwright").BrowserContext;
  type Page = import("playwright").Page;

  const ORDERS_URL = "https://www.cssbuy.com/shop/cate/order";
  const MANUAL_LOGIN_TIMEOUT_MS = 3 * 60 * 1000;
  const AUTO_LOGIN_TIMEOUT_MS = 20 * 1000;

  async function isLoginPage(page: Page): Promise<boolean> {
    try {
      if (/login|signin|sign-in/i.test(page.url())) return true;
      const pw = page.locator('input[type="password"]');
      if ((await pw.count()) > 0 && (await pw.first().isVisible())) return true;
    } catch {}
    return false;
  }

  async function tryAutoLogin(page: Page): Promise<void> {
    const userLoc = page.locator([
      'input[name="username"]', 'input[name="account"]', 'input[name="email"]',
      'input[name="loginname"]', 'input[placeholder*="user" i]', 'input[placeholder*="account" i]',
      'input[placeholder*="e-mail" i]', 'input[placeholder*="邮箱"]', 'input[placeholder*="账号"]',
    ].join(", ")).first();
    const passLoc = page.locator('input[type="password"]').first();
    await userLoc.fill(user, { timeout: 5000 });
    await passLoc.fill(pass, { timeout: 5000 });
    log("Credenciales cargadas.");

    const captchaVisible = await page.locator("text=/verification code|captcha|验证码/i").first().isVisible().catch(() => false);
    if (captchaVisible) {
      log("Captcha detectado: completá el código de verificación y presioná Login.");
      return;
    }

    const btn = page.locator([
      'button[type="submit"]', 'button:has-text("Login")', 'button:has-text("Log in")',
      'button:has-text("Sign in")', 'button:has-text("登录")', '.login-btn', '.submit-btn',
    ].join(", ")).first();
    try {
      await btn.click({ timeout: 5000 });
    } catch {
      await passLoc.press("Enter");
    }
  }

  async function waitUntilLoggedIn(page: Page, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!(await isLoginPage(page))) return true;
      await page.waitForTimeout(1500);
    }
    return false;
  }

  // API v3 del sitio nuevo: GET paginado con soporte de fechas
  async function fetchApiV3Orders(page: Page, opt: SyncOptions): Promise<RawItem[]> {
    return page.evaluate(async (dateParams) => {
      const token = (localStorage.getItem("css-token") || "").trim();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      const all: Record<string, unknown>[] = [];
      const pageSize = 50;
      const startQuery = dateParams?.startDate ? `&starttime=${encodeURIComponent(dateParams.startDate)}` : "";
      const endQuery = dateParams?.endDate ? `&endtime=${encodeURIComponent(dateParams.endDate)}` : "";

      for (let p = 1; p <= 100; p++) {
        let data: any = null;
        try {
          const res = await fetch(
            `https://www.cssbuy.com/api/v3/user/order?page=${p}&pageSize=${pageSize}${startQuery}${endQuery}`,
            { headers, credentials: "include" }
          );
          data = await res.json();
        } catch { break; }
        if (!data || data.code !== 0) break;
        const d = data.data;
        const list = Array.isArray(d) ? d : (d?.records ?? d?.list ?? d?.orders);
        if (!Array.isArray(list) || list.length === 0) break;
        for (const it of list) if (it && typeof it === "object") all.push(it as Record<string, unknown>);
        const total = Array.isArray(d) ? 0 : Number(d?.total ?? d?.count ?? 0);
        if (list.length < pageSize || (total > 0 && all.length >= total)) break;
      }
      return all;
    }, opt);
  }

  async function fetchLegacyOrders(page: Page, opt: SyncOptions): Promise<RawItem[]> {
    return page.evaluate(async (dateParams) => {
      const P = 50, M = 2000;
      const A: Record<string, unknown>[] = [];
      let csrf = "";
      try { csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""; } catch {}
      if (!csrf) {
        const m = document.documentElement.innerHTML.match(/csrf[_-]?token['"\\s:=]+['"]?([a-zA-Z0-9]+)/i);
        if (m) csrf = m[1];
      }
      let jwtToken = "";
      try {
        jwtToken = localStorage.getItem("css-token") || "";
        if (!jwtToken) {
          const u = JSON.parse(localStorage.getItem("userInfo") || "{}");
          jwtToken = u.token || "";
        }
      } catch {}

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      };
      if (csrf) { headers["X-CSRF-Token"] = csrf; headers["X-XSRF-TOKEN"] = csrf; }
      if (jwtToken) { headers["Authorization"] = "Bearer " + jwtToken; headers["token"] = jwtToken; headers["css-token"] = jwtToken; }

      let pn = 1, hm = true;
      while (hm) {
        const params = new URLSearchParams();
        params.set("orderState", "all");
        params.set("starttime", dateParams?.startDate || "");
        params.set("endtime", dateParams?.endDate || "");
        params.set("sTime", dateParams?.startDate || "");
        params.set("eTime", dateParams?.endDate || "");
        params.set("pageSize", String(P));
        params.set("pageNum", String(pn));
        params.set("query", "");
        params.set("inchina", "");
        if (csrf) params.set("_token", csrf);
        try {
          const res = await fetch("https://www.cssbuy.com/web/order", { method: "POST", headers, body: params.toString() });
          const text = await res.text();
          let data: unknown;
          try { data = JSON.parse(text); } catch { break; }
          const d = data as Record<string, unknown> & { data?: Record<string, unknown> };
          const list = (d?.list as unknown[]) ?? (d?.orders as unknown[]) ?? (d?.data?.list as unknown[]) ?? (d?.data?.orders as unknown[]) ?? (d?.data?.data as unknown[]) ?? (Array.isArray(data) ? (data as unknown[]) : null);
          if (!Array.isArray(list) || list.length === 0) break;
          for (const it of list) {
            if (it && typeof it === "object") {
              const rawObj = it as Record<string, unknown>;
              const subItems = (rawObj.goods_list || rawObj.goods || rawObj.items || rawObj.order_goods) as unknown[];
              if (Array.isArray(subItems) && subItems.length > 0) {
                for (const sub of subItems) {
                  if (sub && typeof sub === "object") {
                    A.push({ ...rawObj, ...(sub as Record<string, unknown>), parent_order_sn: rawObj.order_sn || rawObj.oid || rawObj.id });
                  }
                }
              } else {
                A.push(rawObj);
              }
            }
          }
          hm = list.length >= P && A.length < M;
          if (hm) pn++;
        } catch { break; }
      }
      return A;
    }, opt);
  }

  async function newContext(browser: Browser, useSession: boolean): Promise<BrowserContext> {
    return browser.newContext({
      ...(useSession && fs.existsSync(SESSION_FILE) ? { storageState: SESSION_FILE } : {}),
      locale: "es-ES",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
  }

  async function saveSession(context: BrowserContext): Promise<void> {
    try { await context.storageState({ path: SESSION_FILE }); } catch {}
  }

  const hasSession = fs.existsSync(SESSION_FILE);
  let browser = await chromium.launch({ headless: hasSession });
  let context = await newContext(browser, hasSession);
  let page = await context.newPage();

  try {
    log(`Abriendo ${ORDERS_URL} (${hasSession ? "headless con sesión guardada" : "navegador visible"})...`);
    await page.goto(ORDERS_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4000);

    if (await isLoginPage(page)) {
      log("No hay sesión activa. Intentando login automático...");
      await tryAutoLogin(page).catch((e: Error) => log(`Auto-login incompleto: ${e.message}`));
      let loggedIn = await waitUntilLoggedIn(page, AUTO_LOGIN_TIMEOUT_MS);

      if (!loggedIn && hasSession) {
        log("La sesión guardada no alcanzó. Abriendo navegador visible...");
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: false });
        context = await newContext(browser, false);
        page = await context.newPage();
        await page.goto(ORDERS_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(3000);
        if (await isLoginPage(page)) await tryAutoLogin(page).catch(() => {});
      }

      if (!loggedIn) {
        log("⏳ Resolvé el captcha en la ventana del navegador (espero hasta 3 min)...");
        loggedIn = await waitUntilLoggedIn(page, MANUAL_LOGIN_TIMEOUT_MS);
      }
      if (!loggedIn) throw new Error("No se pudo iniciar sesión (timeout).");
      await saveSession(context);
      log("✅ Login OK. Sesión guardada.");
    } else {
      await saveSession(context);
    }

    log("Extrayendo órdenes...");
    await page.goto(ORDERS_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(5000);

    // 1) API v3 directa (paginada) — método principal y limpio
    const apiItems = await fetchApiV3Orders(page, options);
    log(`API v3 devolvió ${apiItems.length} órdenes.`);

    let items = apiItems;
    if (items.length === 0) {
      log("Sin datos por API v3; usando endpoint clásico /web/order...");
      items = await fetchLegacyOrders(page, options);
      log(`Endpoint clásico devolvió ${items.length} órdenes.`);
    }

    // Filtrar únicamente órdenes válidas (excluir inválidas) y rango de fechas
    items = items
      .filter(isValidOrder)
      .filter((it) =>
        isInDateRange(
          toDate(
            getPath(it, [
              "purchaseTime", "createTime", "addtime", "add_time", "createtime", "create_time",
              "ctime", "order_time", "paytime", "pay_time",
            ])
          ),
          options.startDate,
          options.endDate
        )
      );

    const unique = new Map<string, RawItem>();
    for (const it of items) unique.set(stableKey(it), it);
    const rows = [...unique.values()].map(toRow);

    const { inserted, updated } = await upsertCssbuyOrders(rows);
    const dateRangeStr = options.startDate && options.endDate ? ` (${options.startDate} a ${options.endDate})` : "";
    const message = `Sync Playwright completo: ${rows.length} órdenes válidas${dateRangeStr} (${inserted} nuevas, ${updated} actualizadas)`;
    log(`✅ ${message}`);
    return { ok: true, total: rows.length, inserted, updated, message };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
