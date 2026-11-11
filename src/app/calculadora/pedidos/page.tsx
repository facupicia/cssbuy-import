"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CalculatorNavigation } from "@/components/calculadora/CalculatorNavigation";
import { SavedPurchaseLinks } from "@/components/calculadora/SavedPurchaseLinks";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import { UnsavedNavigationGuard } from "@/components/admin/UnsavedNavigationGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { loadCalcConfig } from "@/lib/pricing";
import { fetchLiveFx } from "@/lib/fx";
import { fmtARS, fmtUSD } from "@/lib/utils";
import { newPlan, newPlanLine, parsePlan, planMissing, planQuote, canReadCssbuyProduct, type PlanInput, type PlanLine, type PurchasePlan } from "@/lib/purchase-plans";
import { appendSavedLinks, type SavedProductLink } from "@/lib/purchase-plan-sources";
import { readCssbuyProduct } from "@/lib/purchase-plans-client";

const surface = "rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 sm:p-6";
const muted = "text-sm text-[var(--color-fg-muted)]";
const control = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";
const statuses = { borrador: "Borrador", listo: "Listo para revisar", archivado: "Archivado" };
const inputOf = (plan: PurchasePlan): PlanInput => {
  const { id, version, createdAt, updatedAt, ...input } = plan;
  void id; void version; void createdAt; void updatedAt;
  return input;
};
async function api(method = "GET", body?: unknown) {
  const response = await fetch("/api/compras", { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo completar la operación."), { status: response.status });
  return data;
}

function Numeric({ label, value, onChange, nullable = false, ...props }: {
  label: string; value: number | null; onChange: (value: number | null) => void; nullable?: boolean;
  min?: number; max?: number; step?: string | number; hint?: string; id?: string;
}) {
  return <Input label={label} type="number" min={0} step="any" {...props} value={value ?? ""} onChange={event => onChange(event.target.value === "" ? (nullable ? null : 0) : Number(event.target.value))} />;
}

export default function PurchasePlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [form, setForm] = useState<PlanInput | null>(null);
  const [saved, setSaved] = useState<PurchasePlan | null>(null);
  const [initial, setInitial] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState("");
  const [updatingFx, setUpdatingFx] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [exporting, setExporting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = !!form && JSON.stringify(form) !== initial;
  const busy = saving || !!reading || updatingFx;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const data = await api(); setPlans(data.pedidos); setAuthenticated(true); }
    catch (error) { if ((error as { status?: number }).status === 401) setAuthenticated(false); else setError(error instanceof Error ? error.message : "No se pudieron cargar los pedidos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: "center" }); } }, [error]);
  const calculation = useMemo(() => {
    if (!form) return null;
    try { return planQuote(parsePlan({ ...form, estado: "borrador" })).resultados; } catch { return null; }
  }, [form]);
  const missing = form ? planMissing(form) : [];
  const hasWeights = !!form?.lineas.length && form.lineas.every(line => !!line.pesoG);
  const salesComplete = !!form?.lineas.length && form.lineas.every(line => !!line.ventaARS);
  function change(patch: Partial<PlanInput>) { setForm(current => current ? { ...current, ...patch } : current); setNotice(""); }
  function lineChange(id: string, patch: Partial<PlanLine>) { setForm(current => current ? { ...current, lineas: current.lineas.map(line => line.id === id ? { ...line, ...patch } : line) } : current); setNotice(""); }
  function open(plan?: PurchasePlan) {
    const config = loadCalcConfig();
    const next = plan ? inputOf(plan) : newPlan(config.fx.blue, config.fx.cny, config.envio.depositFeePct * 100);
    setForm(next); setInitial(JSON.stringify(next)); setSaved(plan ?? null); setError(""); setNotice(""); setLink("");
  }
  function back() { if (dirty) setDiscard(true); else { setForm(null); setError(""); setNotice(""); } }
  function addLink() {
    try {
      const line = newPlanLine(link);
      if ((form?.lineas.length ?? 0) >= 100) throw new Error("Cada pedido admite hasta 100 variantes.");
      change({ lineas: [...(form?.lineas ?? []), line] }); setLink(""); setError("");
    } catch (error) { setError((error as Error).message); }
  }
  function addSaved(items: SavedProductLink[]) {
    if (!form) return "Abrí un pedido antes de agregar productos.";
    const result = appendSavedLinks(form.lineas, items);
    change({ lineas: result.lineas }); setError("");
    const message = `${result.added} productos agregados desde tus enlaces guardados.${result.skipped ? ` ${result.skipped} ya estaban en el pedido y se omitieron.` : ""} Revisá precio, peso y envío antes de presupuestar.`;
    setNotice(message); return message;
  }
  async function read(line: PlanLine) {
    setReading(line.id); setError(""); setNotice("");
    try {
      const product = await readCssbuyProduct(line.url);
      lineChange(line.id, { ...(product.nombre ? { nombre: product.nombre } : {}), ...(product.precioCNY !== null ? { precioCNY: product.precioCNY } : {}), leidoEn: product.leidoEn });
      setNotice(product.precioCNY === null ? "Se leyó el nombre. El precio no está disponible en yuanes: completalo desde CSSBuy y revisá la variante." : "Datos leídos. Confirmá el precio para la cantidad y variante elegidas; puede cambiar por volumen. El peso se carga como estimación.");
    } catch (error) { setError((error as Error).message); }
    finally { setReading(""); }
  }
  async function save() {
    if (!form) return;
    setError(""); setNotice("");
    let input: PlanInput;
    try { input = parsePlan(form); } catch (error) { setError((error as Error).message); return; }
    setSaving(true);
    try {
      const data = await api(saved ? "PATCH" : "POST", { ...input, ...(saved ? { id: saved.id, version: saved.version } : {}) });
      const plan = data.pedido as PurchasePlan;
      setSaved(plan); setForm(inputOf(plan)); setInitial(JSON.stringify(inputOf(plan)));
      setPlans(current => [plan, ...current.filter(item => item.id !== plan.id)]); setNotice("Pedido guardado. Podés retomarlo desde cualquier dispositivo con tu cuenta.");
    } catch (error) { if ((error as { status?: number }).status === 401) setAuthenticated(false); setError((error as Error).message); }
    finally { setSaving(false); }
  }
  async function refreshFx() {
    setUpdatingFx(true); setError("");
    try {
      const result = await fetchLiveFx();
      if (!result.blue && !result.cny) throw new Error("No se pudieron consultar las cotizaciones. Cargalas a mano.");
      change({ ...(result.blue ? { usdARS: result.blue } : {}), ...(result.cny ? { cnyUSD: result.cny } : {}) });
      setNotice(`${result.blue && result.cny ? "Cotizaciones consultadas" : "Actualización parcial: revisá ambas cotizaciones"} · ${new Date(result.fetchedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. Confirmá el cambio que realmente pagás.`);
    } catch (error) { setError((error as Error).message); }
    finally { setUpdatingFx(false); }
  }
  function exportQuote() {
    if (!form || missing.length) return;
    try {
      const input = parsePlan(form);
      localStorage.setItem("cssbuy-cotizacion-cargar", JSON.stringify(planQuote(input, crypto.randomUUID())));
      setExporting(true); router.push("/");
    } catch (error) { setError((error as Error).message); }
  }

  return <><Navbar /><main className="mx-auto max-w-7xl space-y-8 px-4 pt-8 pb-24 sm:px-6 [&_input]:scroll-mt-48 [&_select]:scroll-mt-48 [&_textarea]:scroll-mt-48 [&_button]:scroll-mt-48">
    <CalculatorNavigation />
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Próximos pedidos</h1><p className={muted}>Armá tu próxima compra desde enlaces de CSSBuy. Elegí talles y cantidades, estimá cuánto necesitás y guardá el pedido para retomarlo.</p></div>
      {!form && <Button variant="primary" disabled={loading || !authenticated} onClick={() => open()}>Crear pedido</Button>}
      {form && <Button disabled={busy} onClick={back}>Volver a mis pedidos</Button>}
    </header>
    {!authenticated && <AdminAccessNotice returnTo="/calculadora/pedidos" />}
    {error && <div ref={errorRef} role="alert" tabIndex={-1} className="scroll-mt-48 rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">{error}{!form && <Button className="ml-4" onClick={load}>Reintentar</Button>}</div>}
    {notice && <p role="status" className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">{notice}</p>}
    {!form ? <section aria-label="Mis pedidos" className="space-y-4">
      <label className="flex w-fit items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Ver archivados</label>
      {loading ? <div role="status" aria-label="Cargando pedidos" className="space-y-4">{[1,2,3].map(id => <div key={id} className="h-24 animate-pulse rounded-xl bg-[var(--color-bg-subtle)] motion-reduce:animate-none" />)}</div>
      : plans.filter(plan => showArchived || plan.estado !== "archivado").length ? <div className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">{plans.filter(plan => showArchived || plan.estado !== "archivado").map(plan => {
        const missing = planMissing(plan), total = planQuote(plan).resultados.costoTotalARS;
        return <article key={plan.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6"><div className="min-w-0 space-y-2"><h2 className="break-words text-lg font-semibold">{plan.nombre}</h2><p className={muted}>{statuses[plan.estado]} · {plan.lineas.reduce((sum, line) => sum + line.cantidad, 0)} unidades · {new Date(plan.updatedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p><p className="text-sm tabular-nums">{fmtARS(total)} <span className="text-[var(--color-fg-muted)]">{missing.length ? `parcial · falta ${missing.join(", ")}` : "estimados"}</span></p></div><Button onClick={() => open(plan)}>Abrir pedido</Button></article>;
      })}</div> : <div className={`${surface} space-y-4 py-12 text-center`}><h2 className="text-xl font-semibold">{showArchived ? "Todavía no creaste pedidos" : "Tu próxima compra empieza con un enlace"}</h2><p className={muted}>Reuní productos, compará cantidades y conocé el costo antes de comprar.</p><Button variant="primary" disabled={!authenticated} onClick={() => open()}>Crear mi primer pedido</Button></div>}
    </section> : <>
      <UnsavedNavigationGuard active={dirty && !exporting} guardHistory />
      <div className="sticky top-14 z-30 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 lg:top-16"><p className={muted}>{dirty ? "Cambios sin guardar" : saved ? "Pedido guardado" : "Nuevo borrador"}</p><div className="flex flex-wrap gap-2"><Button disabled={busy || !calculation || !!missing.length || dirty || !saved} onClick={exportQuote}>Abrir en calculadora</Button><Button variant="primary" disabled={busy || !authenticated} onClick={save}>Guardar pedido</Button></div></div>
      <fieldset disabled={busy} className="min-w-0 space-y-8 disabled:opacity-80">
        <section className={`${surface} grid gap-4 sm:grid-cols-2`} aria-label="Datos del pedido">
          <Input label="Nombre del pedido" maxLength={120} value={form.nombre} onChange={event => change({ nombre: event.target.value })} />
          <div className="space-y-2"><label htmlFor="plan-status" className={muted}>Estado</label><select id="plan-status" className={control} value={form.estado} onChange={event => change({ estado: event.target.value as PlanInput["estado"] })}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </section>
        <section className="space-y-4" aria-labelledby="products-title">
          <div><h2 id="products-title" className="text-xl font-semibold">Productos y variantes</h2><p className={muted}>Una fila por talle o color. Podés repetir el mismo enlace para combinar variantes.</p></div>
          <SavedPurchaseLinks currentPlanId={saved?.id ?? ""} onAdd={addSaved} />
          <div className="flex flex-col items-end gap-4 sm:flex-row"><Input label="Enlace del producto" type="url" value={link} placeholder="https://www.cssbuy.com/shop/goodsDetail?..." onChange={event => setLink(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} /><Button variant="primary" className="w-full shrink-0 sm:w-auto" disabled={!link.trim()} onClick={addLink}>Agregar producto</Button></div>
          {!form.lineas.length && <p className="rounded-xl bg-[var(--color-bg-subtle)] p-6 text-sm">Pegá un enlace para empezar. El precio y el peso se pueden completar a mano o revisar después.</p>}
          {form.lineas.map((line, index) => <article key={line.id} className={`${surface} space-y-4`} aria-label={`Producto ${index + 1}`}>
            <div className="flex flex-wrap items-center justify-between gap-4"><a className="break-all text-sm underline underline-offset-4" href={line.url} target="_blank" rel="noreferrer">{canReadCssbuyProduct(line.url) ? "Ver producto en CSSBuy" : "Ver producto de origen"}</a><div className="flex flex-wrap gap-2">{canReadCssbuyProduct(line.url) && <Button onClick={() => read(line)}>Leer enlace en Chrome</Button>}<Button disabled={form.lineas.length >= 100} onClick={() => change({ lineas: [...form.lineas, { ...line, id: crypto.randomUUID(), variante: "", cantidad: 1, envioChinaCNY: 0 }] })}>Otra variante</Button><Button variant="ghost" aria-label={`Quitar producto ${index + 1}`} onClick={() => change({ lineas: form.lineas.filter(item => item.id !== line.id) })}>Quitar</Button></div></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input id={`name-${line.id}`} label="Producto" maxLength={200} value={line.nombre} placeholder="Nombre del modelo" onChange={event => lineChange(line.id, { nombre: event.target.value })} />
              <Input id={`variant-${line.id}`} label="Talle y color" maxLength={200} value={line.variante} placeholder="Ej.: L · Negro" onChange={event => lineChange(line.id, { variante: event.target.value })} />
              <Numeric id={`qty-${line.id}`} label="Cantidad" min={1} max={10000} step={1} value={line.cantidad} onChange={value => lineChange(line.id, { cantidad: value ?? 0 })} />
              <Numeric id={`price-${line.id}`} label="Precio unitario CNY" min={0.01} nullable value={line.precioCNY} onChange={value => lineChange(line.id, { precioCNY: value })} />
              <Numeric id={`shipping-${line.id}`} label="Envío China total CNY" value={line.envioChinaCNY} hint="Total de esta fila; no por unidad." onChange={value => lineChange(line.id, { envioChinaCNY: value ?? 0 })} />
              <Numeric id={`weight-${line.id}`} label="Peso estimado por unidad (g)" min={1} nullable value={line.pesoG} hint="Incluí el embalaje estimado." onChange={value => lineChange(line.id, { pesoG: value })} />
              <Numeric id={`sale-${line.id}`} label="Venta prevista por unidad ARS" min={1} nullable value={line.ventaARS} hint="Opcional, para simular el margen." onChange={value => lineChange(line.id, { ventaARS: value })} />
              <div className="space-y-2 self-center"><p className={muted}>Costo por unidad puesto acá</p><p className="text-lg font-semibold tabular-nums">{calculation && hasWeights && !missing.length ? fmtARS(calculation.productosCalc[index].costoUnitARS) : "Pendiente de completar"}</p></div>
            </div>
            {line.leidoEn && <p className={muted}>Enlace leído el {new Date(line.leidoEn).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. Revisá precio por volumen, stock y variante en CSSBuy antes de comprar.</p>}
          </article>)}
          <details className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm"><summary className="cursor-pointer font-medium">Cómo leer enlaces desde Chrome</summary><div className="mt-4 space-y-2"><p>Usá el conector CSSBuy de PLUG versión 1.1 o posterior. Abrí el producto en Chrome, esperá a que cargue y pulsá Leer enlace. Solo se toman los datos disponibles en la ficha; talles, cantidades y peso se revisan a mano.</p><p><a href="/plug-cssbuy-connector.zip" download className="underline">Descargar conector actualizado</a>. Extraé el ZIP, cargá la carpeta en chrome://extensions con Modo de desarrollador y recargá PLUG. Si ya lo tenés, reemplazá sus archivos y pulsá Recargar en la extensión.</p><p>Si CSSBuy solicita iniciar sesión o verificar acceso, completalo en su pestaña. La carga manual siempre está disponible.</p></div></details>
        </section>
        <section className={`${surface} space-y-4`} aria-labelledby="costs-title">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 id="costs-title" className="text-xl font-semibold">Costos del pedido</h2><p className={muted}>Los cambios iniciales vienen de tu calculadora guardada. Revisalos para esta compra.</p></div><Button onClick={refreshFx}>Consultar cotizaciones</Button></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Numeric label="Pesos por dólar" min={0.01} value={form.usdARS} onChange={value => change({ usdARS: value ?? 0 })} />
            <Numeric label="Yuanes por dólar" min={0.01} value={form.cnyUSD} onChange={value => change({ cnyUSD: value ?? 0 })} />
            <Numeric label="Flete internacional USD" nullable value={form.fleteUSD} hint="Total del paquete; 0 si no corresponde." onChange={value => change({ fleteUSD: value })} />
            <Numeric label="Comisión estimada %" max={100} value={form.comisionPct} onChange={value => change({ comisionPct: value ?? 0 })} />
            <Numeric label="Impuestos estimados USD" nullable value={form.impuestosUSD} hint="Importe total previsto; no se calcula una tasa legal." onChange={value => change({ impuestosUSD: value })} />
            <Numeric label="Otros gastos USD" value={form.extraUSD} hint="Se suman al paquete antes de la comisión." onChange={value => change({ extraUSD: value ?? 0 })} />
            <Numeric label="Presupuesto máximo ARS" nullable value={form.presupuestoARS} onChange={value => change({ presupuestoARS: value })} />
          </div>
        </section>
        <section className={`${surface} space-y-4`} aria-labelledby="summary-title" aria-live="polite">
          <h2 id="summary-title" className="text-xl font-semibold">{missing.length ? "Estimación parcial" : "Estimación del pedido"}</h2>
          {missing.length > 0 && <p className="text-sm text-[var(--color-warning)]">Falta completar: {missing.join(", ")}. Los importes pendientes todavía no están incluidos.</p>}
          {!calculation ? <p role="status" className={muted}>Revisá los campos numéricos: cantidades enteras y positivas, cotizaciones mayores que cero y costos sin valores negativos.</p> : <>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
              ["Mercadería y envío China", fmtUSD(calculation.productosUSDTotal)], ["Flete y otros gastos", fmtUSD(calculation.costoEnvioTotalUSD)],
              ["Comisión", fmtUSD(calculation.depositFeeUSD)], ["Impuestos estimados", form.impuestosUSD === null ? "Pendientes" : fmtUSD(calculation.impuestosUSD)],
            ].map(([label, value]) => <div key={label}><dt className={muted}>{label}</dt><dd className="mt-2 font-semibold tabular-nums">{value}</dd></div>)}</dl>
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg bg-[var(--color-bg-subtle)] p-4"><div><p className={muted}>{missing.length ? "Subtotal conocido" : "Inversión estimada"}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{fmtARS(calculation.costoTotalARS)}</p><p className={muted}>{fmtUSD(calculation.costoTotalUSD)}</p></div><p className={muted}>{form.lineas.reduce((sum, line) => sum + line.cantidad, 0)} unidades · {(calculation.pesoTotalG / 1000).toLocaleString("es-AR")} kg estimados</p></div>
            {form.presupuestoARS !== null && <p className={`text-sm ${calculation.costoTotalARS > form.presupuestoARS ? "text-[var(--color-danger)]" : "text-[var(--color-fg-muted)]"}`}>{calculation.costoTotalARS > form.presupuestoARS ? `Supera tu presupuesto por ${fmtARS(calculation.costoTotalARS - form.presupuestoARS)}.` : `${fmtARS(form.presupuestoARS - calculation.costoTotalARS)} disponibles del presupuesto${missing.length ? " antes de completar los costos pendientes" : ""}.`}</p>}
            {salesComplete && !missing.length && <p className="text-sm">Venta prevista: {fmtARS(calculation.ingresoTotalARS)}. Margen sobre mercadería: {fmtARS(calculation.gananciaTotalARS)} ({calculation.ingresoTotalARS > 0 ? ((calculation.gananciaTotalARS / calculation.ingresoTotalARS) * 100).toFixed(1) : "0"}%). Antes de publicidad, comisiones de cobro y otros gastos de venta.</p>}
            <p className={muted}>Flete, impuestos y comisión se reparten por peso. Es una simulación: precio, peso y disponibilidad se confirman al comprar y recibir en depósito.</p>
          </>}
        </section>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="plan-notes">Notas del pedido</label><textarea id="plan-notes" className={control} rows={3} maxLength={4000} value={form.notas} onChange={event => change({ notas: event.target.value })} placeholder="Qué confirmar con el vendedor, medidas o alternativas…" /></div>
      </fieldset>
      {busy && <p role="status">{saving ? "Guardando pedido…" : updatingFx ? "Consultando cotizaciones…" : "Leyendo el producto desde Chrome…"}</p>}
      <p className={muted}>Guardá el pedido completo para abrirlo en la calculadora. Se carga como una nueva cotización para seguir trabajando; revisá cualquier cálculo que tengas abierto.</p>
      <ConfirmDialog open={discard} onOpenChange={setDiscard} title="Descartar cambios del pedido" description="Los cambios que todavía no guardaste se perderán. El pedido guardado se conserva." confirmText="Descartar cambios" onConfirm={() => { setForm(null); setDiscard(false); setError(""); setNotice(""); }} />
    </>}
  </main></>;
}
