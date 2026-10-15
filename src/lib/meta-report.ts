export interface MetaAction { action_type: string; value: string }
export interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  account_currency: string;
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

function metric(actions: MetaAction[] | undefined, type: string): number | null {
  const raw = actions?.find(a => a.action_type === type)?.value;
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeInsight(row: MetaInsight) {
  const spend = Number(row.spend);
  const impressions = Number(row.impressions);
  if (!Number.isFinite(spend) || spend < 0 || !Number.isFinite(impressions) || impressions < 0) {
    throw new Error("Respuesta de métricas inválida.");
  }
  // Website purchases only: never add overlapping omni/pixel/purchase counts.
  const purchases = metric(row.actions, "offsite_conversion.fb_pixel_purchase");
  const revenue = metric(row.action_values, "offsite_conversion.fb_pixel_purchase");
  const linkClicks = metric(row.actions, "link_click");
  return {
    campaignId: row.campaign_id, campaignName: row.campaign_name,
    currency: row.account_currency, since: row.date_start, until: row.date_stop,
    spend, impressions, linkClicks,
    landingPageViews: metric(row.actions, "landing_page_view"),
    addsToCart: metric(row.actions, "offsite_conversion.fb_pixel_add_to_cart"),
    checkouts: metric(row.actions, "offsite_conversion.fb_pixel_initiate_checkout"),
    websitePurchases: purchases, websiteRevenue: revenue,
    cpc: linkClicks && linkClicks > 0 ? spend / linkClicks : null,
    cpa: purchases && purchases > 0 ? spend / purchases : null,
    roas: revenue !== null && spend > 0 ? revenue / spend : null,
  };
}

export function parseReportRange(params: URLSearchParams) {
  const since = params.get("since") ?? "";
  const until = params.get("until") ?? "";
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(since) || !valid(until) || since > until
    || Date.parse(until) - Date.parse(since) > 90 * 86400000) {
    throw new Error("Indicá since y until como AAAA-MM-DD, en orden y con hasta 90 días de diferencia.");
  }
  return { since, until };
}

export async function getMetaCampaignReport(range: { since: string; until: string }) {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID?.replace(/^act_/, "");
  const version = process.env.META_GRAPH_API_VERSION;
  if (!token || !account || !/^\d+$/.test(account) || !version || !/^v\d+\.0$/.test(version)) {
    throw new Error("Configurá META_ACCESS_TOKEN, META_AD_ACCOUNT_ID y META_GRAPH_API_VERSION en el servidor.");
  }
  const rows: MetaInsight[] = [];
  let after: string | undefined;
  const seen = new Set<string>();
  // Reconstruct every page on the fixed Meta host; never follow paging.next.
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://graph.facebook.com/${version}/act_${account}/insights`);
    url.searchParams.set("fields", "campaign_id,campaign_name,account_currency,date_start,date_stop,spend,impressions,actions,action_values");
    url.searchParams.set("level", "campaign");
    url.searchParams.set("time_range", JSON.stringify(range));
    url.searchParams.set("use_unified_attribution_setting", "true");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    // Never expose Graph error payloads, request URLs, or tokens to callers/logs.
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? "Meta rechazó el acceso. Revisá el token y los permisos ads_read."
      : "No se pudo consultar Meta. Revisá la configuración y reintentá.");
    const body = await response.json() as {
      data?: MetaInsight[]; error?: unknown;
      paging?: { next?: string; cursors?: { after?: string } };
    };
    if (body.error || !Array.isArray(body.data)) throw new Error("Meta devolvió una respuesta inválida.");
    rows.push(...body.data);
    if (!body.paging?.next) return rows.map(normalizeInsight);
    after = body.paging.cursors?.after;
    if (!after || seen.has(after)) throw new Error("Meta devolvió una paginación inválida.");
    seen.add(after);
  }
  throw new Error("El reporte supera el límite de páginas. Reducí el intervalo.");
}
