"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { normalizeInsight } from "@/lib/meta-report";
import { DEFAULT_SELLING_COSTS, type productAdEconomics, type SellingCosts } from "@/lib/profitability";

type Campaign = ReturnType<typeof normalizeInsight>;
type Product = ReturnType<typeof productAdEconomics>;
const money = (value: number | null, currency = "ARS") => value === null ? "Sin datos"
  : new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const decimal = (value: number | null) => value === null ? "Sin datos" : value.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function initialRange() {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const until = new Date(`${date}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() - 1);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 27);
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

const COST_LABELS: Record<keyof SellingCosts, string> = {
  feePercent: "Comisiones e impuestos variables (%)", shippingARS: "Envío a tu cargo por pedido (ARS)",
  packagingARS: "Packaging por pedido (ARS)", targetProfitARS: "Ganancia deseada por pedido (ARS)",
};

export default function PublicidadPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [range, setRange] = useState(initialRange);
  const [costs, setCosts] = useState({ ...DEFAULT_SELLING_COSTS });
  const [appliedCosts, setAppliedCosts] = useState<SellingCosts | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [campaignError, setCampaignError] = useState("");
  const [costError, setCostError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportedRange, setReportedRange] = useState<typeof range | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setCampaigns(null); setProducts(null); setCampaignError(""); setCostError("");
    const read = async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401) setUnlocked(false);
        throw new Error(body.error ?? "No se pudo consultar el reporte.");
      }
      return body;
    };
    const params = new URLSearchParams(Object.entries(costs).map(([key, value]) => [key, String(value)]));
    const result = await Promise.allSettled([
      read(`/api/integraciones/meta?${new URLSearchParams(range)}`),
      read(`/api/integraciones/costos?${params}`),
    ]);
    if (result[0].status === "fulfilled") {
      setCampaigns(result[0].value.campaigns); setReportedRange(result[0].value.range);
    } else setCampaignError(result[0].reason instanceof Error ? result[0].reason.message : "Error consultando Meta.");
    if (result[1].status === "fulfilled") {
      setProducts(result[1].value.products); setAppliedCosts(result[1].value.assumptions);
    } else setCostError(result[1].reason instanceof Error ? result[1].reason.message : "Error consultando inventario.");
    setLoading(false);
  }, [range, costs]);

  useEffect(() => {
    if (unlocked) return;
    let active = true;
    void fetch("/api/publicidad/session", { cache: "no-store" }).then(response => {
      if (response.ok && active) {
        setUnlocked(true);
        void loadReports();
      }
    }).catch(() => { /* El formulario permite reintentar si no hay conexión. */ });
    return () => { active = false; };
  }, [unlocked, loadReports]);

  return <>
    <Navbar />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-balance">Publicidad y rentabilidad</h1>
          <p className="text-sm text-[var(--color-fg-muted)] max-w-2xl text-pretty">Consultá el rendimiento de Meta y calculá cuánto podés pagar por una venta con los costos de tu inventario.</p>
        </div>
        <Link href="/configuracion" className="text-sm underline underline-offset-4">Gestionar acceso</Link>
      </div>

      {!unlocked ? <AdminAccessNotice returnTo="/publicidad" /> : <>
        <form onSubmit={e => { e.preventDefault(); void loadReports(); }} className="space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div><Input label="Desde" type="date" required value={range.since} max={range.until} onChange={e => setRange({ ...range, since: e.target.value })} /></div>
            <div><Input label="Hasta" type="date" required value={range.until} min={range.since} onChange={e => setRange({ ...range, until: e.target.value })} /></div>
            <Button type="submit" disabled={loading}>{loading ? "Consultando…" : "Actualizar reporte y límites"}</Button>
          </div>
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold">Costos adicionales por pedido</legend>
            <p className="text-sm text-[var(--color-fg-muted)]">Supuesto: una unidad por pedido. Los valores en cero no descuentan estos gastos. Completalos para obtener un límite útil.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(Object.keys(COST_LABELS) as (keyof SellingCosts)[]).map(key => <Input key={key} label={COST_LABELS[key]} type="number" min="0" max={key === "feePercent" ? 100 : 1e9} step="0.01" required value={costs[key]} onChange={e => setCosts({ ...costs, [key]: Number(e.target.value) })} />)}
            </div>
          </fieldset>
        </form>

        <section className="space-y-4" aria-busy={loading}>
          <h2 className="text-xl font-semibold">Campañas de Meta</h2>
          <p className="text-sm text-[var(--color-fg-muted)]">Compras del sitio web según la atribución de cada conjunto. Incluye campañas con actividad en el período, aunque hoy estén pausadas. Importes en la moneda indicada por Meta.</p>
          {campaignError && <p role="alert" className="text-sm text-[var(--color-danger)]">{campaignError}</p>}
          {loading ? <div role="status" className="h-24 rounded-lg bg-[var(--color-bg-muted)] animate-pulse p-4">Consultando campañas…</div>
            : campaigns && campaigns.length === 0 ? <p>No hay campañas con actividad en estas fechas.</p>
            : campaigns && <>
              <p className="text-sm">Período consultado: {reportedRange?.since} al {reportedRange?.until}</p>
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-sm text-left tabular-nums">
                  <caption className="sr-only">Rendimiento de campañas de Meta</caption>
                  <thead className="bg-[var(--color-bg-subtle)]"><tr>{["Campaña", "Gasto", "Visitas web", "Carritos", "Compras web", "Costo por compra", "ROAS de compras"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap font-semibold">{label}</th>)}</tr></thead>
                  <tbody>{campaigns.map(c => <tr key={c.campaignId} className="border-t border-[var(--color-border)]">
                    <th scope="row" className="p-4 font-medium min-w-48">{c.campaignName}<span className="block text-xs text-[var(--color-fg-muted)]">{c.currency}</span></th>
                    <td className="p-4 whitespace-nowrap">{money(c.spend, c.currency)}</td><td className="p-4">{decimal(c.landingPageViews)}</td><td className="p-4">{decimal(c.addsToCart)}</td><td className="p-4">{decimal(c.websitePurchases)}</td><td className="p-4 whitespace-nowrap">{money(c.cpa, c.currency)}</td><td className="p-4">{c.roas === null ? "Sin datos" : `${decimal(c.roas)}×`}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
        </section>

        <section className="space-y-4" aria-busy={loading}>
          <h2 className="text-xl font-semibold">Límites por producto · ARS</h2>
          <p className="text-sm text-[var(--color-fg-muted)] max-w-3xl text-pretty">CPA de equilibrio = precio menos costo landed y gastos indicados. CPA objetivo descuenta también tu ganancia deseada. Son estimaciones con costos actuales; no son resultados de campañas ni ganancia neta del negocio.</p>
          {costError && <p role="alert" className="text-sm text-[var(--color-danger)]">{costError}</p>}
          {loading ? <div role="status" className="h-24 rounded-lg bg-[var(--color-bg-muted)] animate-pulse p-4">Consultando costos…</div>
            : products && products.length === 0 ? <p>Cargá productos y sus costos en Inventario para calcular los límites.</p>
            : products && <>
              {appliedCosts && <p className="text-sm text-[var(--color-fg-muted)]">Aplicado: {appliedCosts.feePercent}% de comisiones · Envío {money(appliedCosts.shippingARS)} · Packaging {money(appliedCosts.packagingARS)} · Ganancia deseada {money(appliedCosts.targetProfitARS)}</p>}
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-sm text-left tabular-nums">
                  <caption className="sr-only">Costos y límites de adquisición del inventario</caption>
                  <thead className="bg-[var(--color-bg-subtle)]"><tr>{["Producto", "Stock", "Precio", "Costo landed", "CPA de equilibrio", "CPA objetivo", "ROAS de equilibrio", "Disponibilidad"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap font-semibold">{label}</th>)}</tr></thead>
                  <tbody>{products.map(p => <tr key={p.id} className="border-t border-[var(--color-border)]">
                    <th scope="row" className="p-4 font-medium min-w-48">{p.name}<span className="block text-xs text-[var(--color-fg-muted)]">{p.sku ?? "Sin SKU"}</span></th><td className="p-4">{p.stock}</td>
                    <td className="p-4 whitespace-nowrap">{money(p.priceARS)}</td><td className="p-4 whitespace-nowrap">{money(p.landedCostARS)}</td><td className="p-4 whitespace-nowrap">{money(p.breakEvenCpaARS)}</td><td className="p-4 whitespace-nowrap">{money(p.targetCpaARS)}</td><td className="p-4">{p.breakEvenRoas === null ? "No aplica" : `${decimal(p.breakEvenRoas)}×`}</td><td className="p-4">{p.canAdvertise ? "Con stock y margen" : "Revisar stock o margen"}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
          <p className="text-sm text-[var(--color-fg-muted)]">Para calcular rentabilidad por campaña falta vincular pedidos fechados, productos vendidos y costos al momento de la venta. Las cantidades vendidas acumuladas no se asignan a Meta.</p>
        </section>
      </>}
    </main>
  </>;
}
