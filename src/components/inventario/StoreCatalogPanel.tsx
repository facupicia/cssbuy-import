"use client";
import { useEffect, useRef, useState } from "react";
import { catalogTarget, parseCatalogChanges, type CatalogChanges, type CatalogProduct } from "@/lib/store-catalog-plan";
import { UnsavedNavigationGuard } from "@/components/admin/UnsavedNavigationGuard";
import { fmtARS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Job = { original: CatalogProduct; target: CatalogProduct; operationId: string; status: "pending" | "success" | "error"; error?: string };
const control = "w-full h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm";
const price = (p: CatalogProduct) => {
  const prices = p.variants.map(v => v.price); const min = Math.min(...prices); const max = Math.max(...prices);
  return prices.length ? min === max ? fmtARS(min) : `${fmtARS(min)} a ${fmtARS(max)}` : "Sin variantes";
};
export function StoreCatalogPanel({ categories, storeId, onBusyChange }: {
  categories: { id: number; name: string }[]; storeId: string; onBusyChange: (busy: boolean) => void;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selected, setSelected] = useState<Record<string, CatalogProduct>>({});
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false); const [running, setRunning] = useState(false); const [error, setError] = useState("");
  const [priceMode, setPriceMode] = useState("none"); const [priceValue, setPriceValue] = useState("");
  const [nameMode, setNameMode] = useState("none"); const [nameValue, setNameValue] = useState(""); const [find, setFind] = useState("");
  const [category, setCategory] = useState(""); const [visibility, setVisibility] = useState("");
  const [brandEnabled, setBrandEnabled] = useState(false); const [brand, setBrand] = useState("");
  const [weightEnabled, setWeightEnabled] = useState(false); const [weight, setWeight] = useState("");
  const [descriptionEnabled, setDescriptionEnabled] = useState(false); const [description, setDescription] = useState("");
  const [promotion, setPromotion] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]); const frozenChanges = useRef<CatalogChanges | null>(null); const frozenStore = useRef("");
  const [confirm, setConfirm] = useState(false); const [progress, setProgress] = useState(""); const stop = useRef(false);
  const [queueNotice, setQueueNotice] = useState("");
  async function load(nextPage = 1) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/tiendanube/catalog?page=${nextPage}&q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (data.storeId !== storeId) throw new Error("La tienda conectada cambió. Volvé a comprobar la conexión.");
      setProducts(data.products); setHasMore(data.hasMore); setPage(nextPage);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar el catálogo"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    setSelected({}); setJobs([]); setProgress("");
    try {
      const saved = JSON.parse(sessionStorage.getItem(`plug:catalog-batch:${storeId}`) || "null");
      if (saved?.storeId === storeId && Array.isArray(saved.jobs) && saved.jobs.length > 0 && saved.jobs.length <= 100
        && saved.jobs.every((j: Job) => j.original?.id && /^[a-f0-9]{64}$/.test(j.original.version) && typeof j.operationId === "string")) {
        frozenChanges.current = parseCatalogChanges(saved.changes); frozenStore.current = storeId; setJobs(saved.jobs);
        setProgress("Lote recuperado. Podés revisar sus resultados y retomar los pendientes.");
      }
    } catch { /* A malformed local cache is ignored; the server validates every operation. */ }
    void load();
  }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      if (jobs.length) sessionStorage.setItem(`plug:catalog-batch:${storeId}`, JSON.stringify({ storeId: frozenStore.current, changes: frozenChanges.current, jobs }));
    } catch { setQueueNotice("El navegador no pudo guardar la cola. Mantené esta pantalla abierta para conservar los reintentos."); }
  }, [jobs, storeId]);
  const rawChanges = { ...(priceMode !== "none" ? { price: { mode: priceMode, value: Number(priceValue) } } : {}),
    ...(nameMode !== "none" ? { name: { mode: nameMode, value: nameValue, ...(nameMode === "replace" ? { find } : {}) } } : {}),
    ...(category ? { categoryId: Number(category) } : {}), ...(visibility ? { visibility } : {}),
    ...(brandEnabled ? { brand } : {}), ...(weightEnabled ? { weightKg: Number(weight) } : {}),
    ...(descriptionEnabled ? { description } : {}), ...(promotion ? { clearPromotion: true } : {}) };
  let changes: CatalogChanges | null = null; let validation = ""; let preview: Job[] = [];
  try {
    changes = parseCatalogChanges(rawChanges);
    preview = Object.values(selected).map(original => ({ original, target: catalogTarget(original, changes!), operationId: "", status: "pending" }));
  } catch (e) { validation = e instanceof Error ? e.message : "Cambios inválidos"; }
  const rows = jobs.length ? jobs : preview;
  const activeChanges = jobs.length ? frozenChanges.current : changes;
  const locked = running || jobs.length > 0;
  async function run() {
    setConfirm(false); setError(""); stop.current = false; setRunning(true); onBusyChange(true);
    let queue = jobs;
    if (!queue.length) {
      queue = preview.map(job => ({ ...job, operationId: crypto.randomUUID() }));
      frozenChanges.current = changes; frozenStore.current = storeId; setJobs(queue);
    }
    try {
      for (let i = 0; i < queue.length; i++) {
        if (stop.current) break;
        const job = queue[i]; if (job.status === "success") continue;
        setProgress(`Editando ${i + 1} de ${queue.length}: ${job.original.name}`);
        try {
          const response = await fetch("/api/tiendanube/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            id: job.original.id, version: job.original.version, storeId: frozenStore.current, operationId: job.operationId, changes: frozenChanges.current,
          }) });
          const data = await response.json();
          if (!response.ok) { if ([401, 403, 429, 503].includes(response.status) || String(data.error).includes("tienda conectada cambió")) stop.current = true; throw new Error(data.error || "No se pudo editar"); }
          queue = queue.map((j, index) => index === i ? { ...j, status: "success", error: undefined } : j);
        } catch (e) {
          queue = queue.map((j, index) => index === i ? { ...j, status: "error", error: e instanceof Error ? e.message : "No se pudo editar" } : j);
        }
        setJobs(queue);
      }
      setProgress(`${queue.filter(j => j.status === "success").length} completados · ${queue.filter(j => j.status === "error").length} con error · ${queue.filter(j => j.status === "pending").length} pendientes.`);
    } finally { setRunning(false); onBusyChange(false); }
  }
  function prepare() {
    if (!jobs.length && (!changes || !preview.length || preview.length > 100)) return;
    setConfirm(true);
  }
  return <section aria-label="Catálogo de Tiendanube" className="space-y-6">
    <UnsavedNavigationGuard active={!running && !jobs.length && Object.keys(rawChanges).length > 0} />
    <section aria-label="Seleccionar productos del catálogo" className="space-y-4">
    <h2 className="text-xl font-semibold">Elegí los productos a editar</h2>
    <div className="flex flex-col items-end gap-2 sm:flex-row"><Input label="Buscar en Tiendanube" value={search} disabled={locked || loading} onChange={e => setSearch(e.target.value)} placeholder="Nombre o SKU" /><Button variant="outline" disabled={locked || loading} onClick={() => load(1)}>Buscar catálogo</Button></div>
    {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
    {loading && <p role="status">Cargando catálogo…</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={locked || !products.length} onClick={() => setSelected(old => ({ ...old, ...Object.fromEntries(products.map(p => [p.id, p])) }))}>Seleccionar esta página</Button><Button size="sm" variant="ghost" disabled={locked} onClick={() => setSelected({})}>Quitar selección del catálogo</Button><span className="self-center text-sm">{Object.keys(selected).length} seleccionados · máximo 100</span></div>
    <div className="overflow-auto"><table className="w-full text-sm"><caption className="sr-only">Productos del catálogo de Tiendanube</caption><thead><tr><th className="p-2 text-left">Elegir</th><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Precio de lista</th></tr></thead><tbody>{products.map(p => <tr key={p.id} className="border-t border-[var(--color-border)]"><td className="p-2"><input type="checkbox" aria-label={`Editar ${p.name} en Tiendanube`} checked={Boolean(selected[p.id])} disabled={locked} onChange={e => setSelected(old => { const next = { ...old }; if (e.target.checked) next[p.id] = p; else delete next[p.id]; return next; })} /></td><td className="p-2"><span className="block font-medium">{p.name}</span><span className="block text-xs text-[var(--color-fg-muted)]">#{p.id} · {p.visibility === "visible" ? "Publicado" : p.visibility === "unlisted" ? "Por enlace" : "Oculto"} · {p.variants.length} variantes{p.linkedItemId ? " · Vinculado al inventario" : ""}</span></td><td className="p-2 text-right tabular-nums">{price(p)}</td></tr>)}</tbody></table></div>
    {!loading && !products.length && !error && <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">No se encontraron productos. Probá otro nombre o SKU, o publicá un producto desde tu inventario.</p>}
    <div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={locked || loading || page === 1} onClick={() => load(page - 1)}>Página anterior</Button><span className="text-sm">Página {page}</span><Button size="sm" variant="outline" disabled={locked || loading || !hasMore} onClick={() => load(page + 1)}>Página siguiente</Button></div>
    </section>
    <fieldset disabled={locked} className="space-y-4 rounded-xl border border-[var(--color-border)] p-4 sm:p-6">
      <legend className="px-2 text-xl font-semibold">Prepará los cambios</legend>
      <p className="text-sm text-[var(--color-fg-muted)]">Elegí los campos que querés modificar en los {Object.keys(selected).length} productos seleccionados. Primero vas a revisar el resultado.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Precio de lista<select aria-label="Cambio de precio de lista" className={control} value={priceMode} onChange={e => setPriceMode(e.target.value)}><option value="none">Sin cambio</option><option value="percent">Aumentar o bajar un porcentaje</option><option value="fixed">Fijar el mismo precio</option></select></label>
        {priceMode !== "none" && <Input label={priceMode === "percent" ? "Variación del precio (%)" : "Nuevo precio de lista ($)"} type="number" step="0.01" value={priceValue} onChange={e => setPriceValue(e.target.value)} hint={priceMode === "percent" ? "Usá un número negativo para bajar el precio." : "Se aplica a todas las variantes seleccionadas."} />}
        <label className="space-y-1 text-sm">Nombre<select aria-label="Cambio de nombre" className={control} value={nameMode} onChange={e => setNameMode(e.target.value)}><option value="none">Sin cambio</option><option value="set">Fijar nombre completo</option><option value="replace">Buscar y reemplazar</option><option value="prefix">Agregar al principio</option><option value="suffix">Agregar al final</option></select></label>
        {nameMode === "replace" && <Input label="Texto a buscar en el nombre" value={find} onChange={e => setFind(e.target.value)} />}
        {nameMode !== "none" && <Input label="Texto nuevo del nombre" value={nameValue} onChange={e => setNameValue(e.target.value)} />}
        <label className="space-y-1 text-sm">Categoría<select aria-label="Reemplazar categoría del catálogo" className={control} value={category} onChange={e => setCategory(e.target.value)}><option value="">Sin cambio</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="block text-xs text-[var(--color-fg-muted)]">Si elegís una, reemplaza las categorías actuales.</span></label>
        <label className="space-y-1 text-sm">Visibilidad<select aria-label="Visibilidad del catálogo" className={control} value={visibility} onChange={e => setVisibility(e.target.value)}><option value="">Conservar visibilidad</option><option value="visible">Publicar</option><option value="hidden">Ocultar</option></select></label>
      </div>
      <p className="text-xs text-[var(--color-fg-muted)]">Estos son precios de lista de Tiendanube. El descuento por transferencia se aplica en el medio de pago.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={brandEnabled} onChange={e => setBrandEnabled(e.target.checked)} />Cambiar marca</label>
      {brandEnabled && <Input label="Nueva marca del catálogo" value={brand} onChange={e => setBrand(e.target.value)} hint="Vacío quita la marca." />}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={weightEnabled} onChange={e => setWeightEnabled(e.target.checked)} />Cambiar peso de envío</label>
      {weightEnabled && <Input label="Nuevo peso del catálogo (kg)" type="number" step="0.001" value={weight} onChange={e => setWeight(e.target.value)} />}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={descriptionEnabled} onChange={e => setDescriptionEnabled(e.target.checked)} />Reemplazar descripción completa</label>
      {descriptionEnabled && <label className="block space-y-2 text-sm">Nueva descripción del catálogo<textarea aria-label="Nueva descripción del catálogo" rows={4} maxLength={10000} className={`${control} h-auto py-2`} value={description} onChange={e => setDescription(e.target.value)} /><span className="block text-xs text-[var(--color-warning)]">Reemplaza toda la descripción actual, incluida su tabla de talles. Vacío la elimina.</span></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={promotion} onChange={e => setPromotion(e.target.checked)} />Quitar precios promocionales de las variantes</label>
    </fieldset>
    <div className="space-y-2"><h4 className="font-semibold">Vista previa de cambios</h4>{!jobs.length && validation && <p className="text-sm text-[var(--color-fg-muted)]">{validation}</p>}
      {activeChanges && <ul className="list-disc space-y-1 pl-5 text-sm">
        {activeChanges.price && <li>Precio: {activeChanges.price.mode === "percent" ? `${activeChanges.price.value}% sobre cada variante` : fmtARS(activeChanges.price.value)}</li>}
        {activeChanges.name && <li>Nombre: {{ set: "fijar", prefix: "agregar al principio", suffix: "agregar al final", replace: "buscar y reemplazar" }[activeChanges.name.mode]} · {activeChanges.name.find ? `buscar «${activeChanges.name.find}» → ` : ""}«{activeChanges.name.value}»</li>}
        {activeChanges.categoryId && <li>Categoría: {categories.find(c => c.id === activeChanges.categoryId)?.name || activeChanges.categoryId}</li>}
        {activeChanges.visibility && <li>Visibilidad: {activeChanges.visibility === "visible" ? "Publicado" : "Oculto"}</li>}
        {activeChanges.brand !== undefined && <li>Marca: {activeChanges.brand || "sin marca"}</li>}
        {activeChanges.weightKg !== undefined && <li>Peso de cada variante: {activeChanges.weightKg} kg</li>}
        {activeChanges.clearPromotion && <li>Se quitan los precios promocionales.</li>}
        {activeChanges.description !== undefined && <li>Descripción completa: <span className="whitespace-pre-wrap break-words">{activeChanges.description || "se elimina"}</span></li>}
      </ul>}
      <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><caption className="sr-only">Antes y después del lote de catálogo</caption><thead><tr><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Precio anterior → nuevo</th><th className="p-2 text-left">Resultado</th></tr></thead><tbody>{rows.map(job => <tr key={job.original.id} className="border-t border-[var(--color-border)]"><td className="p-2"><span className="block">{job.original.name}</span>{job.original.name !== job.target.name && <span className="block font-medium">→ {job.target.name}</span>}</td><td className="p-2 text-right tabular-nums"><span>{price(job.original)} → {price(job.target)}</span><details className="mt-1 text-xs"><summary className="cursor-pointer">Ver {job.original.variants.length} variantes</summary><ul className="space-y-1 pt-1">{job.original.variants.map((variant, index) => <li key={variant.id}>{variant.label}: {fmtARS(variant.price)} → {fmtARS(job.target.variants[index].price)}</li>)}</ul></details></td><td className="p-2">{job.status === "success" ? "Completado" : job.status === "error" ? job.error : "Pendiente"}</td></tr>)}</tbody></table></div>
    </div>
    <p className="text-xs text-[var(--color-fg-muted)]">Se modifican únicamente los campos elegidos. Las fotos, el stock y las variantes se conservan. Cada variante recibe su propio precio según la operación. Los precios promocionales se conservan salvo que elijas quitarlos.</p>
    <div className="flex flex-wrap gap-2"><Button disabled={running || (!jobs.length && (!changes || !preview.length || preview.length > 100)) || (!!jobs.length && jobs.every(j => j.status === "success"))} onClick={prepare}>{jobs.length ? "Reintentar pendientes y fallidos" : `Revisar edición de ${Object.keys(selected).length} productos`}</Button>
      {!!jobs.length && !running && <Button variant="outline" onClick={() => { try { sessionStorage.removeItem(`plug:catalog-batch:${storeId}`); } catch {} setJobs([]); setSelected({}); setProgress(""); setQueueNotice(""); void load(page); }}>Nueva edición / actualizar catálogo</Button>}
      {running && <Button variant="outline" onClick={() => { stop.current = true; }}>Detener después del artículo actual</Button>}</div>
    {progress && <p role="status" className="text-sm">{progress}</p>}
    {queueNotice && <p role="alert" className="text-sm text-[var(--color-warning)]">{queueNotice}</p>}
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Editar ${rows.filter(j => j.status !== "success").length} artículos en Tiendanube`}
      description="Se aplicarán los campos elegidos y los precios de la vista previa, producto por producto. El progreso se guarda para poder retomar si hay un error. Esta edición modifica el catálogo de Tiendanube y conserva el stock actual de la tienda."
      confirmText="Confirmar edición del catálogo" variant="primary" onConfirm={run} />
  </section>;
}
