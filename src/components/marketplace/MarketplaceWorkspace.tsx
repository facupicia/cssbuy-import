"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, ExternalLink, ImageOff, RefreshCw, Search, ShoppingBag } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter } from "@/components/ui/Dialog";
import { MARKETPLACE_CATEGORIES, MARKETPLACE_CONDITIONS, marketplaceNeedsReview, type MarketplaceDraft, type MarketplaceInput, type MarketplaceProduct, type MarketplaceStatus } from "@/lib/marketplace";
import { marketplaceConnector } from "@/lib/marketplace-client";

type Workspace = { products: MarketplaceProduct[]; drafts: MarketplaceDraft[] };
const empty: Workspace = { products: [], drafts: [] };
const money = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const fieldClass = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm text-[var(--color-fg)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-border-focus)]";
const statusLabels: Record<MarketplaceStatus, string> = { draft: "Borrador", sent: "En Chrome", published: "Publicado", sold: "Vendido", archived: "Retirado" };
async function request(body?: unknown): Promise<Workspace & { draft: MarketplaceDraft }> {
  const response = await fetch("/api/marketplace", { credentials: "same-origin", cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || "No se pudo completar la operación."); return value;
}
function Select({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; placeholder?: string }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span><select className={fieldClass} value={value} onChange={e => onChange(e.target.value)}><option value="">{placeholder || "Elegir"}</option>{options.map(v => <option key={v}>{v}</option>)}</select></label>;
}

export function MarketplaceWorkspace() {
  const router = useRouter();
  const [data, setData] = useState<Workspace>(empty), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("available"), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]), [active, setActive] = useState<string | null>(null), [form, setForm] = useState<MarketplaceInput | null>(null), [savedForm, setSavedForm] = useState("");
  const [busy, setBusy] = useState(false), [connector, setConnector] = useState<"unknown" | "connected" | "missing">("unknown"), [help, setHelp] = useState(false);
  const [batchCondition, setBatchCondition] = useState(""), [queue, setQueue] = useState<string[]>([]), [listingUrl, setListingUrl] = useState("");
  const [pending, setPending] = useState<{ kind: "item" | "link"; value: string } | null>(null), [confirmStatus, setConfirmStatus] = useState<"sold" | "archived" | null>(null);
  const editor = useRef<HTMLElement>(null);
  const dirty = form !== null && JSON.stringify(form) !== savedForm;
  const activeProduct = data.products.find(p => p.id === active), draft = data.drafts.find(d => d.itemId === active);
  const stale = Boolean(activeProduct && form && activeProduct.version !== form.sourceVersion);
  const eligible = activeProduct && activeProduct.issues.length === 0;
  const load = useCallback(async () => {
    setError(""); setLoading(true);
    try { const state = await request(); setData(state); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const url = new URL(a.href); if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault(); e.stopPropagation(); setPending({ kind: "link", value: url.pathname + url.search });
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  function choose(id: string) {
    const p = data.products.find(p => p.id === id), d = data.drafts.find(d => d.itemId === id);
    if (!p) return;
    const value = d ? { itemId: d.itemId, sourceVersion: d.sourceVersion, title: d.title, description: d.description, price: d.price, condition: d.condition, category: d.category, location: d.location } : p.generated;
    setActive(id); setForm({ ...value }); setSavedForm(JSON.stringify(value)); setListingUrl(d?.listingUrl || ""); setError(""); setMessage("");
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); });
  }
  function open(id: string) { if (busy || id === active) return; if (dirty) setPending({ kind: "item", value: id }); else choose(id); }
  function update<K extends keyof MarketplaceInput>(key: K, value: MarketplaceInput[K]) { setForm(f => f ? { ...f, [key]: value } : f); }
  function remember(d: MarketplaceDraft) { setData(s => ({ ...s, drafts: [...s.drafts.filter(v => v.itemId !== d.itemId), d] })); }
  async function action(work: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function save() {
    if (!form) return;
    const result = await request({ action: "save", draft: form, revision: draft?.revision || 0 });
    remember(result.draft); setSavedForm(JSON.stringify(form)); setMessage("Borrador guardado en PLUG.");
  }
  async function checkConnector() { await action(async () => { try { const r = await marketplaceConnector("ping"); setConnector(r.available ? "connected" : "missing"); setMessage("Extensión conectada."); } catch (e) { setConnector("missing"); throw e; } }); }
  async function send() {
    if (!draft || dirty) return;
    await marketplaceConnector("prepare", draft.itemId, draft.revision); setConnector("connected");
    const result = await request({ action: "status", itemId: draft.itemId, revision: draft.revision, status: "sent" }); remember(result.draft);
    setMessage("Preparado en Chrome. En la pestaña de Facebook abrí la extensión y pulsá Cargar publicación. Después revisá y publicá allí.");
  }
  async function setStatus(status: MarketplaceStatus) {
    if (!draft) return;
    const result = await request({ action: "status", itemId: draft.itemId, revision: draft.revision, status, listingUrl });
    remember(result.draft); setListingUrl(result.draft.listingUrl || ""); setConfirmStatus(null);
    setMessage(status === "published" ? "Enlace registrado. Estado confirmado por vos." : "Estado actualizado en PLUG. El inventario y el aviso de Facebook se administran por separado.");
  }
  async function prepareBatch() {
    let count = 0;
    const ids: string[] = [];
    for (const id of selected) {
      const p = data.products.find(p => p.id === id)!;
      const existing = data.drafts.find(d => d.itemId === id);
      if (existing) { ids.push(id); continue; }
      try {
        const result = await request({ action: "save", draft: { ...p.generated, condition: batchCondition }, revision: 0 });
        remember(result.draft); count++; ids.push(id);
        if (id === active) {
          const value = { ...p.generated, condition: batchCondition };
          setForm(value); setSavedForm(JSON.stringify(value));
        }
      } catch (e) { setQueue(ids); throw new Error(`${count} borradores guardados. ${p.name}: ${(e as Error).message}`); }
    }
    setQueue(ids); setSelected([]); setMessage(`${count} borradores nuevos. Revisá cada uno antes de enviarlo a Facebook.`);
  }
  const filtered = useMemo(() => data.products.filter(p => {
    const d = data.drafts.find(d => d.itemId === p.id);
    if (search && !`${p.name} ${p.generated.title}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))) return false;
    if (filter === "available") return p.issues.length === 0 && (!d || ["draft", "sent"].includes(d.status));
    if (filter === "published") return d?.status === "published";
    if (filter === "review") return d && ["published", "sent"].includes(d.status) && marketplaceNeedsReview(p, d);
    if (filter === "drafts") return d && ["draft", "sent"].includes(d.status);
    return true;
  }), [data, search, filter]);
  const visible = filtered.slice((page - 1) * 12, page * 12), pages = Math.max(1, Math.ceil(filtered.length / 12));
  useEffect(() => { setPage(p => Math.min(p, pages)); }, [pages]);
  const orphaned = data.drafts.filter(d => d.listingUrl && !data.products.some(p => p.id === d.itemId) && d.status === "published");
  const reviewCount = data.drafts.filter(d => ["published", "sent"].includes(d.status) && marketplaceNeedsReview(data.products.find(p => p.id === d.itemId), d)).length;
  const nextId = (queue.length ? queue : filtered.map(p => p.id)).find((id, i, ids) => i > ids.indexOf(active || ""));
  return <><Navbar /><main className="mx-auto max-w-7xl space-y-6 px-4 pb-28 pt-8 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Marketplace</h1><p className="mt-2 max-w-2xl text-sm text-[var(--color-fg-muted)]">Tus productos de PLUG, listos para publicar en Facebook. Un aviso por producto.</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => setHelp(!help)} aria-expanded={help}>Conectar Chrome</Button><Button icon={<RefreshCw size={16} />} disabled={busy || dirty || loading} onClick={load}>Actualizar</Button></div></div>
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4" aria-label="Conexión con Chrome">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm"><span className="font-medium">{connector === "connected" ? "Chrome conectado" : "Carga asistida con Chrome"}</span><span className="ml-2 text-[var(--color-fg-muted)]">Revisás y publicás desde Facebook.</span></p><Button size="sm" disabled={busy} onClick={checkConnector}>{connector === "connected" ? "Comprobar conexión" : "Detectar extensión"}</Button></div>
      {help && <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-fg-muted)]"><ol className="list-decimal space-y-2 pl-5"><li><a className="underline" href="/plug-marketplace-connector.zip" download>Descargá la extensión PLUG Marketplace</a> y extraé la carpeta.</li><li>Abrí <code>chrome://extensions</code>, activá Modo de desarrollador y elegí Cargar descomprimida. Seleccioná la carpeta que contiene el archivo manifest.json.</li><li>Recargá PLUG y pulsá Detectar extensión. Guardá un borrador y elegí Cargar en Facebook.</li><li>En Facebook, abrí la extensión desde el ícono de rompecabezas de Chrome y pulsá Cargar publicación. Revisá fotos, categoría y ubicación antes de publicar.</li></ol><p>La extensión se activa cuando la usás. Si una foto externa necesita permiso, te lo pedirá. Siempre podés copiar el texto y cargar las fotos manualmente.</p></div>}
    </section>
    {error && <div role="alert" className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-4 text-sm text-[var(--color-danger)]">{error}{!data.products.length && !loading && <Button className="ml-3" onClick={load}>Reintentar</Button>}</div>}
    {message && <p role="status" className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">{message}</p>}
    {reviewCount > 0 && <button className="w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100" onClick={() => { setFilter("review"); setPage(1); }}>{reviewCount} {reviewCount === 1 ? "aviso necesita" : "avisos necesitan"} revisión por cambios en el inventario. Revisar →</button>}
    {orphaned.length > 0 && <div className="rounded-lg border border-[var(--color-border)] p-4 text-sm"><p className="font-medium">Avisos cuyo producto ya no está en el inventario</p>{orphaned.map(d => <a key={d.id} className="mt-2 block underline" href={d.listingUrl!} target="_blank" rel="noreferrer">Revisar y retirar: {d.title} ↗</a>)}</div>}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-4" aria-label="Productos para Marketplace">
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Input id="market-search" label="Buscar producto" value={search} prefix={<Search size={16} />} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div><label className="space-y-1 text-sm"><span className="block text-xs text-[var(--color-fg-muted)]">Mostrar</span><select className="h-9 max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="available">Disponibles</option><option value="drafts">Borradores</option><option value="published">Publicados</option><option value="review">Necesitan revisión</option><option value="all">Todos</option></select></label></div>
        {selected.length > 0 && <div className="space-y-3 rounded-lg bg-[var(--color-bg-subtle)] p-4"><p className="text-sm font-medium">{selected.length} productos seleccionados</p><Select label="Estado común (opcional)" value={batchCondition} onChange={setBatchCondition} options={MARKETPLACE_CONDITIONS} placeholder="Elegir después en cada aviso" /><div className="flex flex-wrap gap-2"><Button disabled={busy || dirty} onClick={() => action(prepareBatch)}>Preparar {selected.length} borradores</Button><Button variant="ghost" disabled={busy} onClick={() => setSelected([])}>Quitar selección</Button></div><p className="text-xs text-[var(--color-fg-muted)]">Los borradores existentes se conservan. Preparar no publica en Facebook.</p></div>}
        {queue.length > 0 && <p className="flex flex-wrap items-center gap-2 text-sm">Cola: {queue.length} productos. <Button size="sm" disabled={busy} onClick={() => open(queue[0])}>Revisar primero</Button><Button size="sm" variant="ghost" onClick={() => setQueue([])}>Cerrar cola</Button></p>}
        {loading && <div role="status" className="space-y-3">{[0, 1, 2].map(v => <div className="h-24 animate-pulse rounded-lg bg-[var(--color-bg-muted)] motion-reduce:animate-none" key={v} />)}<span className="sr-only">Cargando inventario</span></div>}
        {!loading && !filtered.length && <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center"><ShoppingBag className="mx-auto mb-3 h-8 w-8 text-[var(--color-fg-muted)]" /><p className="font-medium">{data.products.length ? "No hay productos en esta vista" : "Empezá con tus productos"}</p><p className="mt-2 text-sm text-[var(--color-fg-muted)]">{data.products.length ? "Cambiá la búsqueda o elegí Todos para revisar agotados y productos incompletos." : "Agregá fotos, precio y disponibilidad en el inventario de PLUG."}</p><Link className="mt-4 inline-block text-sm underline" href="/inventario">Abrir inventario</Link></div>}
        <div className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">{!loading && visible.map(p => {
          const d = data.drafts.find(d => d.itemId === p.id), needs = d && marketplaceNeedsReview(p, d), selectable = p.issues.length === 0 && (!d || ["draft", "sent"].includes(d.status));
          return <div className={`flex items-center gap-3 p-3 ${active === p.id ? "bg-[var(--color-bg-subtle)]" : ""}`} key={p.id}>
            <input className="h-5 w-5 shrink-0 accent-[var(--color-fg)]" type="checkbox" aria-label={`Seleccionar ${p.name}`} checked={selected.includes(p.id)} disabled={!selectable || busy} onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} />
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2" aria-pressed={active === p.id} disabled={busy} onClick={() => open(p.id)}>
              {p.photos[0] ? <img className="h-20 w-16 shrink-0 rounded-md bg-[var(--color-bg-subtle)] object-cover" src={p.photos[0]} alt="" loading="lazy" /> : <span className="flex h-20 w-16 shrink-0 items-center justify-center bg-[var(--color-bg-subtle)]"><ImageOff size={20} /></span>}
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{p.name}</span><span className="mt-1 block text-sm tabular-nums">{money(p.price)} <span className="text-xs text-[var(--color-fg-muted)]">· {p.sizes.length ? p.sizes.join(" / ") : "Sin talle informado"}</span></span><span className="mt-1 block text-xs text-[var(--color-fg-muted)]">{p.issues[0] || `${p.stock} ${p.stock === 1 ? "unidad" : "unidades"}`} · {d ? statusLabels[d.status] : "Sin preparar"}{needs ? " · Revisar" : ""}</span></span><ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          </div>;
        })}</div>
        {filtered.length > 0 && <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-fg-muted)]"><span>{filtered.length} productos · Página {page} de {pages}</span><div className="flex gap-2"><Button size="sm" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button size="sm" disabled={page >= pages || busy} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div></div>}
      </section>
      <section ref={editor} tabIndex={-1} className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 sm:p-6 focus:outline-none" aria-label="Editor de publicación">
        {!activeProduct || !form ? <div className="py-12 text-center"><ShoppingBag className="mx-auto mb-4 h-10 w-10 text-[var(--color-fg-muted)]" /><h2 className="text-xl font-semibold">Elegí una prenda</h2><p className="mx-auto mt-3 max-w-xs text-sm text-[var(--color-fg-muted)]">Preparamos un título claro y una descripción corta con los datos de tu inventario.</p></div> : <div className="space-y-5">
          <div><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-semibold">{activeProduct.name}</h2><span className="shrink-0 text-xs text-[var(--color-fg-muted)]">{dirty ? "Sin guardar" : draft ? statusLabels[draft.status] : "Nuevo borrador"}</span></div><p className="mt-2 text-xs text-[var(--color-fg-muted)]">El precio parte de nuestro inventario. Podés editarlo para este aviso.</p></div>
          {(stale || activeProduct.issues.length > 0) && <div className="space-y-2 rounded-lg bg-[var(--color-bg-subtle)] p-3 text-sm">{activeProduct.issues.map(t => <p key={t}>{t}</p>)}{stale && <><p>El producto cambió desde que preparaste este borrador.</p><Button size="sm" disabled={busy} onClick={() => { update("sourceVersion", activeProduct.version); setMessage("Datos actuales tomados como referencia. Revisá el precio y los talles del texto antes de guardar."); }}>Revisé los cambios del inventario</Button><p className="text-xs">Ahora: {money(activeProduct.price)} · {activeProduct.sizes.join(" / ") || "Sin talles"} · {activeProduct.stock} unidades.</p></>}</div>}
          <form onSubmit={e => { e.preventDefault(); void action(save); }} className="space-y-4">
            <Input id="market-title" label="Título de Marketplace" value={form.title} maxLength={100} onChange={e => update("title", e.target.value)} required /><p className="-mt-2 text-right text-xs text-[var(--color-fg-muted)]">{form.title.length}/100</p>
            <label className="block space-y-2 text-sm font-medium">Descripción<textarea className={`${fieldClass} min-h-28 resize-y font-normal`} maxLength={1500} value={form.description} required onChange={e => update("description", e.target.value)} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><Input id="market-price" label="Precio del aviso (ARS)" type="number" min="0.01" max="99999999" step="0.01" required value={form.price || ""} onChange={e => update("price", Number(e.target.value))} /><Select label="Estado real de la prenda" value={form.condition} onChange={v => update("condition", v)} options={MARKETPLACE_CONDITIONS} placeholder="Elegir antes de enviar" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><Select label="Categoría de Marketplace" value={form.category} onChange={v => update("category", v)} options={MARKETPLACE_CATEGORIES} /><Input id="market-location" label="Localidad pública" value={form.location} maxLength={80} required onChange={e => update("location", e.target.value)} /></div>
            <p className="text-xs text-[var(--color-fg-muted)]">La extensión te recuerda revisar la ubicación que muestra Facebook. La descripción y el Instagram son editables.</p>
            <div><p className="mb-2 text-sm font-medium">Fotos del producto · {activeProduct.photos.length}</p><div className="flex gap-2 overflow-x-auto pb-2">{activeProduct.photos.map((src, i) => <a key={src} className="shrink-0 rounded-md focus-visible:outline-2" href={src} target="_blank" rel="noreferrer"><img className="h-24 w-20 rounded-md bg-[var(--color-bg-subtle)] object-cover" src={src} alt={`Foto ${i + 1} de ${activeProduct.name}`} loading="lazy" /></a>)}</div><p className="text-xs text-[var(--color-fg-muted)]">Se usan las fotos actuales del inventario en el orden guardado.</p></div>
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={busy || !eligible || stale}>{busy ? "Procesando…" : "Guardar borrador"}</Button><Button type="button" disabled={busy} icon={<Copy size={14} />} onClick={() => action(async () => { await navigator.clipboard.writeText(`${form.title}\n${money(form.price)}\n\n${form.description}`); setMessage("Título, precio y descripción copiados."); })}>Copiar texto</Button></div>
          </form>
          {draft && !["published", "sold", "archived"].includes(draft.status) && <div className="space-y-3 border-t border-[var(--color-border)] pt-4"><Button className="w-full" variant="primary" icon={<ExternalLink size={16} />} disabled={busy || dirty || !eligible || stale || !form.condition || !form.category} onClick={() => action(send)}>Cargar en Facebook</Button><p className="text-xs text-[var(--color-fg-muted)]">Abre el formulario y prepara los datos en la extensión. No pulsa Publicar.</p></div>}
          {draft && <div className="space-y-3 border-t border-[var(--color-border)] pt-4"><h3 className="text-sm font-semibold">Registrar el aviso</h3>{draft.listingUrl && <a className="inline-flex items-center gap-2 text-sm underline" href={draft.listingUrl} target="_blank" rel="noreferrer">Abrir aviso de Facebook <ExternalLink size={14} /></a>}<Input id="market-url" label="Enlace de la publicación" placeholder="https://www.facebook.com/marketplace/item/…" value={listingUrl} onChange={e => setListingUrl(e.target.value)} /><Button icon={<Check size={14} />} disabled={busy || dirty || stale || !eligible || !listingUrl} onClick={() => action(() => setStatus("published"))}>{draft.listingUrl ? "Confirmar aviso actualizado" : "Confirmar que ya publiqué"}</Button><p className="text-xs text-[var(--color-fg-muted)]">El estado lo confirmás vos. Guardar el enlace no comprueba Facebook ni modifica el stock.</p>{draft.listingUrl && <div className="flex flex-wrap gap-2"><Button disabled={busy || dirty} size="sm" onClick={() => setConfirmStatus("sold")}>Marcar vendido en PLUG</Button><Button disabled={busy || dirty} size="sm" onClick={() => setConfirmStatus("archived")}>Ya retiré el aviso</Button></div>}</div>}
          {nextId && <Button className="w-full" disabled={busy} icon={<ArrowRight size={16} />} onClick={() => open(nextId)}>Siguiente producto</Button>}
        </div>}
      </section>
    </div>
  </main>
  <Dialog open={Boolean(pending)} onOpenChange={v => { if (!v) setPending(null); }}><DialogContent><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Podés volver al borrador para guardarlos o descartarlos y continuar.</DialogDescription><DialogFooter><Button onClick={() => setPending(null)}>Volver al borrador</Button><Button variant="danger" onClick={() => { const next = pending!; setPending(null); if (next.kind === "item") choose(next.value); else { setSavedForm(JSON.stringify(form)); router.push(next.value); } }}>Descartar y continuar</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={Boolean(confirmStatus)} onOpenChange={v => { if (!v) setConfirmStatus(null); }}><DialogContent><DialogTitle>{confirmStatus === "sold" ? "¿Confirmás la venta?" : "¿Ya retiraste el aviso de Facebook?"}</DialogTitle><DialogDescription>Esto solo actualiza el seguimiento de Marketplace en PLUG. El stock del inventario y el aviso de Facebook se actualizan por separado.</DialogDescription><DialogFooter><Button onClick={() => setConfirmStatus(null)}>Cancelar</Button><Button variant="primary" disabled={busy} onClick={() => action(() => setStatus(confirmStatus!))}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
