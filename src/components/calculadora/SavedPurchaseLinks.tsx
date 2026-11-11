"use client";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { filterSavedLinks, SOURCE_LABELS, type SavedLinksResult, type SavedLinkSource, type SavedProductLink } from "@/lib/purchase-plan-sources";

export function SavedPurchaseLinks({ currentPlanId, onAdd }: { currentPlanId: string; onAdd: (items: SavedProductLink[]) => string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SavedLinksResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<SavedLinkSource>("proveedores");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const panelRef = useRef<HTMLDivElement>(null);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/compras/guardados", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar los enlaces guardados. Reintentá en unos segundos.");
      setData(body); setSelected([]); setPage(1);
    } catch (error) { setError((error as Error).message); }
    finally { setLoading(false); }
  }
  const filtered = useMemo(() => filterSavedLinks(data?.links ?? [], source, query, currentPlanId), [data, source, query, currentPlanId]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice((page - 1) * 10, page * 10);
  const chosen = (data?.links ?? []).filter(item => selected.includes(item.id));
  function add() {
    try { setMessage(onAdd(chosen)); setSelected([]); setError(""); panelRef.current?.scrollIntoView({ block: "center" }); }
    catch (error) { setError((error as Error).message); }
  }
  return <div className="space-y-4" ref={panelRef}>
    <Button aria-expanded={open} aria-controls="saved-purchase-links" onClick={() => { setOpen(!open); if (!data && !loading && !open) void load(); }}>{open ? "Cerrar enlaces guardados" : "Elegir de mis enlaces guardados"}</Button>
    {open && <section id="saved-purchase-links" aria-label="Enlaces guardados" className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 sm:p-6">
      <div className="space-y-2"><h3 className="text-lg font-semibold">Elegí productos que ya guardaste</h3><p className="text-sm text-[var(--color-fg-muted)]">Se copian el enlace, el nombre y la variante con una unidad. Revisá precio, peso y envío para esta compra. Los catálogos se abren para elegir un producto.</p></div>
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_2fr_auto]"><div className="space-y-2"><label htmlFor="saved-source" className="text-sm font-medium">Buscar en</label><select id="saved-source" className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm" value={source} onChange={event => { setSource(event.target.value as SavedLinkSource); setPage(1); }}>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><Input label="Buscar producto o proveedor" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nombre, talle, proveedor o enlace" /><Button disabled={loading} onClick={load}>Actualizar enlaces</Button></div>
      {loading && <div role="status" aria-label="Cargando enlaces guardados" className="space-y-2">{[1,2,3].map(id => <div key={id} className="h-16 animate-pulse rounded-lg bg-[var(--color-bg-subtle)] motion-reduce:animate-none" />)}</div>}
      {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {data?.warnings.map(warning => <p key={warning} role="status" className="text-sm text-[var(--color-warning)]">{warning}</p>)}
      {!loading && data && <>
        <p className="text-sm text-[var(--color-fg-muted)]" aria-live="polite">{filtered.length} enlaces encontrados · {selected.length} productos seleccionados</p>
        {visible.length ? <ul className="divide-y divide-[var(--color-border)]">{visible.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0 flex-1">{item.kind === "producto" ? <label className="flex cursor-pointer items-start gap-3"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span className="min-w-0"><span className="block break-words text-sm font-semibold">{item.nombre || item.detail}{item.variante ? ` · ${item.variante}` : ""}</span><span className="block break-words text-sm text-[var(--color-fg-muted)]">{item.nombre ? item.detail : "Completá el nombre del producto al agregarlo"}</span></span></label> : <div><p className="break-words text-sm font-semibold">{item.nombre}</p><p className="break-words text-sm text-[var(--color-fg-muted)]">{item.detail}</p></div>}</div><a href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm underline underline-offset-4">{item.kind === "catalogo" ? "Abrir catálogo" : "Ver enlace"}</a></li>)}</ul> : <p className="py-4 text-sm text-[var(--color-fg-muted)]">{query ? "No hay enlaces que coincidan con esa búsqueda." : "No hay enlaces guardados en esta fuente. Los productos necesitan un enlace de origen en su ficha."}</p>}
        {pages > 1 && <div className="flex flex-wrap items-center justify-between gap-2"><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</Button></div>}
        <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-[var(--color-fg-muted)]">Podés seleccionar en varias fuentes antes de agregar.</p><div className="flex flex-wrap gap-2"><Button disabled={!selected.length} onClick={() => setSelected([])}>Limpiar selección</Button><Button variant="primary" disabled={!chosen.length} onClick={add}>Agregar seleccionados ({chosen.length})</Button></div></div>
      </>}
    </section>}
  </div>;
}
