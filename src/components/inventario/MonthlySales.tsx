"use client";

import { useEffect, useState } from "react";
import { fetcher, FetchError } from "@/lib/fetcher";
import { formatSaleDate, salesToday, type InventorySalesReport } from "@/lib/inventory-sales";
import type { InventoryItem } from "@/lib/types";
import { fmtARS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export function MonthlySales({ items, onDateSale }: {
  items: InventoryItem[];
  onDateSale: (item: InventoryItem, pending: InventorySalesReport["pendientes"]) => void;
}) {
  const [mes, setMes] = useState(() => salesToday().slice(0, 7));
  const [report, setReport] = useState<InventorySalesReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setReport(null); setError("");
    fetcher<InventorySalesReport>(`/api/inventario/ventas?mes=${encodeURIComponent(mes)}`)
      .then(data => { if (active) setReport(data); })
      .catch(error => { if (active) setError(error instanceof FetchError ? error.info?.error || error.message : "No se pudo cargar el resumen mensual."); });
    return () => { active = false; };
  }, [mes, items, retry]);
  const total = report?.meses.find(m => m.mes === mes);
  const pendingItems = items.filter(item => report?.pendientes.some(p => p.itemId === item.id));
  return <section aria-labelledby="monthly-sales-title" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="monthly-sales-title" className="text-xl font-semibold">Facturación por mes</h2><p className="mt-1 max-w-2xl text-sm text-[var(--color-fg-muted)]">Ventas registradas en este inventario, con su fecha e importe de venta. Importes en pesos argentinos.</p></div>
      <label className="flex flex-col gap-2 text-sm">Mes a consultar<input type="month" value={mes} min="1900-01" max={salesToday().slice(0, 7)} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMes(e.target.value); }} className="min-h-10 max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 focus-visible:outline-2" /></label>
    </div>
    {error ? <div role="alert" className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-[var(--color-danger)]">{error}</p><Button size="sm" onClick={() => setRetry(n => n + 1)}>Reintentar resumen</Button></div>
      : !report ? <div aria-label="Cargando facturación mensual" role="status" className="mt-6 space-y-3"><div className="h-8 w-48 rounded bg-[var(--color-bg-muted)]" /><p className="text-sm text-[var(--color-fg-muted)]">Cargando ventas…</p></div>
      : <>
        <div aria-live="polite" className="my-6">
          <dl className="grid gap-6 lg:grid-cols-3">
            <div><dt className="text-sm text-[var(--color-fg-muted)]">Facturado del mes</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{fmtARS(total?.facturadoARS || 0)}</dd></div>
            <div><dt className="text-sm text-[var(--color-fg-muted)]">Costo de las prendas</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{fmtARS(total?.costoMercaderiaARS || 0)}</dd></div>
            <div><dt className="text-sm text-[var(--color-fg-muted)]">Ganancia de mercadería</dt><dd className={`mt-2 text-3xl font-semibold tabular-nums ${(total?.gananciaARS || 0) < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-accent)]"}`}>{fmtARS(total?.gananciaARS || 0)}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-[var(--color-fg-muted)]">{total?.unidades || 0} unidades con fecha registrada en este mes</p>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">Ganancia: facturado menos el costo guardado de las prendas. Antes de publicidad, comisiones y otros gastos.</p>
        </div>
        {report.ventas.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Detalle de ventas ({report.ventas.length})</summary><div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]"><table className="w-full text-left text-sm"><caption className="sr-only">Detalle de ventas del mes {mes}</caption><thead className="bg-[var(--color-bg-subtle)]"><tr>{["Fecha", "Producto", "Unidades", "Importe"].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{report.ventas.map(sale => <tr key={sale.id} className="border-t border-[var(--color-border)]"><td className="whitespace-nowrap p-3 tabular-nums">{formatSaleDate(sale.fecha)}</td><td className="min-w-40 p-3">{sale.nombre}{sale.talle ? ` · ${sale.talle}` : ""}</td><td className="p-3 tabular-nums">{sale.unidades}</td><td className="whitespace-nowrap p-3 tabular-nums">{fmtARS(sale.totalARS)}</td></tr>)}</tbody></table></div></details>
          : <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">No hay ventas con fecha registrada en este mes. Al registrar una venta, elegí su fecha para verla acá.</p>}
        {report.meses.length > 1 && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Comparar meses registrados</summary><div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]"><table className="w-full text-left text-sm"><caption className="sr-only">Facturación y ganancia de mercadería por mes</caption><thead className="bg-[var(--color-bg-subtle)]"><tr><th scope="col" className="p-3 font-medium">Mes</th><th scope="col" className="p-3 font-medium">Facturado</th><th scope="col" className="p-3 font-medium">Ganancia de mercadería</th></tr></thead><tbody>{report.meses.map(month => <tr key={month.mes} className="border-t border-[var(--color-border)]"><th scope="row" className="whitespace-nowrap p-3 font-medium">{new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month.mes}-01T12:00:00Z`))}</th><td className="whitespace-nowrap p-3 tabular-nums">{fmtARS(month.facturadoARS)}</td><td className={`whitespace-nowrap p-3 tabular-nums ${month.gananciaARS < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-accent)]"}`}>{fmtARS(month.gananciaARS)}</td></tr>)}</tbody></table></div></details>}
        {pendingItems.length > 0 && <details className="mt-6 rounded-lg border border-[var(--color-border)] p-4"><summary className="cursor-pointer text-sm font-medium">{report.pendientes.reduce((sum, p) => sum + p.unidades, 0)} unidades vendidas sin fecha</summary><p className="mt-3 max-w-2xl text-sm text-[var(--color-fg-muted)]">Estas ventas anteriores todavía no se incluyen en ningún mes. Completá la fecha y el precio que cobraste; el stock ya fue descontado.</p><ul className="mt-4 space-y-3">{pendingItems.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{item.nombre}{item.sku ? ` · ${item.sku}` : ""} · {report.pendientes.filter(p => p.itemId === item.id).reduce((sum, p) => sum + p.unidades, 0)} u.</span><Button size="sm" variant="outline" onClick={() => onDateSale(item, report.pendientes.filter(p => p.itemId === item.id))}>Completar venta de {item.nombre}{item.sku ? ` · ${item.sku}` : ""}</Button></li>)}</ul></details>}
        {report.discrepancias > 0 && <p role="status" className="mt-4 text-sm text-[var(--color-danger)]">Hay cantidades vendidas del inventario menores que su historial de ventas. Revisá las fichas; el resumen conserva los importes registrados.</p>}
        <p className="mt-4 text-xs text-[var(--color-fg-muted)]">El resumen usa ventas cargadas acá. Los pedidos de Tiendanube no se importan automáticamente. Facturación antes de gastos, comisiones y publicidad.</p>
      </>}
  </section>;
}
