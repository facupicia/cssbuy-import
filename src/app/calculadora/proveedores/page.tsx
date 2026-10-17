"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { CalculatorNavigation } from "@/components/calculadora/CalculatorNavigation";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import { UnsavedNavigationGuard } from "@/components/admin/UnsavedNavigationGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EMPTY_SUPPLIER, filterSuppliers, parseSupplier, supplierUrl, type Supplier, type SupplierInput } from "@/lib/suppliers";

const control = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100";
const inputFor = (item: Supplier): SupplierInput => ({ nombre: item.nombre, tipo: item.tipo, categoria: item.categoria, tiendaUrl: item.tiendaUrl, referenciaUrl: item.referenciaUrl, contacto: item.contacto, notas: item.notas, favorito: item.favorito });
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/proveedores", { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "No se pudo completar la operación. Reintentá.", response.status);
  return data;
}

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierInput | null>(null);
  const [initial, setInitial] = useState<SupplierInput>(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const prefillHandled = useRef(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [returnTo, setReturnTo] = useState("/calculadora/proveedores");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api<{ proveedores: Supplier[] }>(); setItems(data.proveedores); setAuthenticated(true);
      if (!prefillHandled.current) {
        prefillHandled.current = true;
        const params = new URLSearchParams(window.location.search);
        if (params.get("nuevo") === "1") {
          const name = (params.get("nombre") || "").trim().toLocaleLowerCase("es");
          let reference = ""; try { reference = supplierUrl(params.get("referencia") || ""); } catch { /* Ignore invalid incoming links. */ }
          const existing = data.proveedores.find(item => (name && item.nombre.toLocaleLowerCase("es") === name) || (reference && item.referenciaUrl === reference));
          if (existing) { const next = inputFor(existing); setForm(next); setInitial(next); setEditing(existing); setNotice("Este vendedor ya está en tu agenda. Podés actualizar su ficha."); }
        }
      }
    }
    catch(e) { if (e instanceof ApiError && e.status === 401) setAuthenticated(false); else setError(e instanceof Error ? e.message : "No se pudo cargar la agenda."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(window.location.pathname + window.location.search);
    if (params.get("nuevo") === "1") {
      let referenciaUrl = ""; try { referenciaUrl = supplierUrl((params.get("referencia") || "").slice(0, 2048)); } catch { /* An invalid incoming reference is left empty. */ }
      const next = { ...EMPTY_SUPPLIER, nombre: (params.get("nombre") || "").slice(0,120), referenciaUrl };
      setForm(next); setInitial(next);
    }
    void load();
  }, [load]);
  useEffect(() => { if (form && authenticated) nameRef.current?.focus(); }, [Boolean(form), authenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: "center" }); }, [error]);
  const dirty = Boolean(form && JSON.stringify(form) !== JSON.stringify(initial));
  const categorias = useMemo(() => [...new Set(items.map(item => item.categoria).filter(Boolean))].sort((a,b) => a.localeCompare(b,"es")), [items]);
  const filtered = useMemo(() => filterSuppliers(items, search, tipo, categoria, favorites), [items, search, tipo, categoria, favorites]);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  useEffect(() => { setPage(1); }, [search, tipo, categoria, favorites]);
  useEffect(() => { setPage(current => Math.min(current, pages)); }, [pages]);
  const visible = filtered.slice((page - 1) * 12, page * 12);
  function openForm(item?: Supplier) {
    const next = item ? inputFor(item) : { ...EMPTY_SUPPLIER };
    setForm(next); setInitial(next); setEditing(item ?? null); setError(""); setNotice("");
    window.scrollTo({ top: 0 });
  }
  function closeForm() {
    setForm(null); setEditing(null); setDiscard(false); setError("");
    window.history.replaceState(window.history.state, "", "/calculadora/proveedores");
    setReturnTo("/calculadora/proveedores");
  }
  async function save() {
    if (!form) return;
    setError(""); setNeedsAccess(false); let valid;
    try { valid = parseSupplier(form); } catch(e) { setError((e as Error).message); return; }
    setSaving(true);
    try {
      const data = await api<{ proveedor: Supplier }>(editing ? "PATCH" : "POST", { ...valid, ...(editing ? { id: editing.id, version: editing.version } : {}) });
      setItems(current => editing ? current.map(item => item.id === editing.id ? data.proveedor : item) : [...current, data.proveedor]);
      closeForm(); setSearch(""); setTipo(""); setCategoria(""); setFavorites(false); setPage(1);
      setNotice(editing ? "Cambios del proveedor guardados." : "Proveedor guardado en tu agenda.");
    } catch(e) { if (e instanceof ApiError && e.status === 401) setNeedsAccess(true); setError(e instanceof Error ? e.message : "No se pudo guardar. Tus datos siguen en el formulario."); }
    finally { setSaving(false); }
  }
  async function toggleFavorite(item: Supplier) {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const data = await api<{ proveedor: Supplier }>("PATCH", { ...inputFor(item), favorito: !item.favorito, id: item.id, version: item.version });
      setItems(current => current.map(i => i.id === item.id ? data.proveedor : i));
      setNotice(data.proveedor.favorito ? `${item.nombre} agregado a favoritos.` : `${item.nombre} quitado de favoritos.`);
    } catch(e) { setError((e as Error).message); } finally { setBusyId(""); }
  }
  async function remove() {
    if (!deleting) return;
    setBusyId(deleting.id); setError("");
    try { await api("DELETE", { id: deleting.id, version: deleting.version }); setItems(current => current.filter(i => i.id !== deleting.id)); setDeleting(null); setNotice("Proveedor eliminado de la agenda."); }
    catch(e) { setError((e as Error).message); setDeleting(null); } finally { setBusyId(""); }
  }
  function clearFilters() { setSearch(""); setTipo(""); setCategoria(""); setFavorites(false); }
  return <><Navbar /><main aria-label={form ? editing ? "Editar proveedor" : "Agregar proveedor" : "Mis proveedores"} className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-24 sm:px-6">
    <CalculatorNavigation />
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="text-3xl font-semibold">{form ? editing ? "Editar proveedor" : "Agregar proveedor" : "Vendedores y fábricas"}</h1><p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">{form ? "Guardá los datos que necesitás para volver a comprarle. Solo el nombre es obligatorio." : "Tu agenda para volver a comprar a los mismos proveedores, con sus enlaces y tus notas a mano."}</p></div>{!form && authenticated && <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={loading || Boolean(busyId)} onClick={() => openForm()}>Agregar proveedor</Button>}</header>
    {error && <div ref={errorRef} role="alert" className="space-y-3 rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]"><p>{error}</p>{!form && <Button variant="outline" disabled={loading || Boolean(busyId)} onClick={() => void load()}>Actualizar agenda</Button>}{form && <p>El formulario conserva lo que escribiste.</p>}{needsAccess && <a href="/configuracion" target="_blank" rel="noopener noreferrer" className="inline-block underline underline-offset-4">Renovar acceso en otra pestaña y volver a guardar</a>}</div>}
    {notice && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] p-4 text-sm text-[var(--color-accent)]">{notice}</p>}
    {loading ? <p role="status" className="py-8 text-sm">Cargando tu agenda…</p> : authenticated === false ? <AdminAccessNotice returnTo={returnTo} /> : authenticated && (form ? <>
      <UnsavedNavigationGuard active={dirty && !saving} />
      <form className="max-w-4xl space-y-8" onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset disabled={saving} className="space-y-4"><legend className="mb-4 text-xl font-semibold">Datos del proveedor</legend>
          <div className="grid gap-4 sm:grid-cols-2"><Input className="placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100" ref={nameRef} label="Nombre del vendedor o fábrica" required maxLength={120} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Cómo lo reconocés" />
          <label className="space-y-2 text-sm"><span className="block font-medium">Tipo de proveedor</span><select aria-label="Tipo de proveedor" className={control} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as SupplierInput["tipo"] })}><option value="vendedor">Vendedor</option><option value="fabrica">Fábrica</option></select></label>
          <Input className="placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100" label="Categoría de productos" maxLength={80} list="supplier-categories" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Remeras, zapatillas, accesorios…" /><datalist id="supplier-categories">{categorias.map(category => <option key={category} value={category} />)}</datalist>
          <Input className="placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100" label="Contacto" maxLength={300} value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} placeholder="WeChat, WhatsApp, correo u otro dato" /></div>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={form.favorito} onChange={e => setForm({ ...form, favorito: e.target.checked })} />Marcar como favorito</label>
        </fieldset>
        <fieldset disabled={saving} className="space-y-4"><legend className="mb-4 text-xl font-semibold">Enlaces para volver a comprar</legend>
          <Input className="placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100" label="Enlace de la tienda o catálogo" type="url" maxLength={2048} value={form.tiendaUrl} onChange={e => setForm({ ...form, tiendaUrl: e.target.value })} placeholder="https://…" hint="La página del vendedor o de la fábrica, si la tenés." />
          <Input className="placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100" label="Producto de referencia" type="url" maxLength={2048} value={form.referenciaUrl} onChange={e => setForm({ ...form, referenciaUrl: e.target.value })} placeholder="https://…" hint="Un producto que ya compraste o que querés volver a pedir. Este enlace puede venir de CSSBuy." />
        </fieldset>
        <fieldset disabled={saving} className="space-y-4"><legend className="mb-4 text-xl font-semibold">Tus notas</legend><label className="block space-y-2 text-sm"><span className="block font-medium">Aclaraciones del proveedor</span><textarea aria-label="Aclaraciones del proveedor" className={`${control} min-h-40 resize-y`} maxLength={4000} rows={6} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Calidad, cómo pedir los talles, tiempos de entrega, qué volverías a comprar…" /></label><p className="text-xs text-[var(--color-fg-muted)]">{form.notas.length}/4000 caracteres. Las notas quedan en tu agenda privada.</p></fieldset>
        <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"><Button type="submit" variant="primary" disabled={saving || !form.nombre.trim()}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar proveedor"}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => dirty ? setDiscard(true) : closeForm()}>Cancelar</Button></div>
      </form>
    </> : <>
      <section aria-label="Buscar y filtrar proveedores" className="space-y-4 rounded-xl bg-[var(--color-bg-subtle)] p-4"><div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]"><Input className="placeholder:text-[var(--color-fg-muted)] placeholder:opacity-100" label="Buscar en la agenda" value={search} prefix={<Search className="h-4 w-4" />} onChange={e => setSearch(e.target.value)} placeholder="Nombre, producto, contacto o nota" /><label className="space-y-2 text-sm"><span className="block font-medium">Tipo</span><select aria-label="Tipo" className={control} value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Vendedores y fábricas</option><option value="vendedor">Vendedores</option><option value="fabrica">Fábricas</option></select></label><label className="space-y-2 text-sm"><span className="block font-medium">Categoría</span><select aria-label="Categoría" className={control} value={categoria} onChange={e => setCategoria(e.target.value)}><option value="">Todas las categorías</option>{categorias.map(category => <option key={category} value={category}>{category}</option>)}</select></label></div><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={favorites} onChange={e => setFavorites(e.target.checked)} />Solo favoritos</label>{Boolean(search || tipo || categoria || favorites) && <Button size="sm" variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>}</div></section>
      <section aria-label="Proveedores guardados" className="space-y-4"><p aria-live="polite" className="text-sm text-[var(--color-fg-muted)]">{filtered.length} {filtered.length === 1 ? "proveedor" : "proveedores"}{filtered.length !== items.length ? ` de ${items.length} guardados` : " guardados"} · Los favoritos aparecen primero</p>
        {!items.length ? <div className="space-y-4 py-8"><h2 className="text-xl font-semibold">Guardá tu primer proveedor</h2><p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Agregalo con su nombre y las aclaraciones que quieras recordar. También podés elegir Guardar vendedor desde un pedido de CSSBuy en Calculadora.</p><Button onClick={() => openForm()} icon={<Plus className="h-4 w-4" />}>Agregar mi primer proveedor</Button></div> : !visible.length ? <div className="space-y-3 py-8"><h2 className="text-xl font-semibold">No hay proveedores con esos filtros</h2><Button variant="outline" onClick={clearFilters}>Ver todos los proveedores</Button></div> : <ul className="divide-y divide-[var(--color-border)]">{visible.map(item => <li key={item.id} className="grid gap-4 py-6 first:pt-0 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0 space-y-3"><div className="flex items-start gap-3"><button type="button" aria-label={`${item.favorito ? "Quitar de" : "Agregar a"} favoritos a ${item.nombre}`} aria-pressed={item.favorito} disabled={Boolean(busyId)} onClick={() => void toggleFavorite(item)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:outline-2 disabled:opacity-50"><Star className="h-5 w-5" fill={item.favorito ? "currentColor" : "none"} /></button><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{item.nombre}</h2><p className="mt-1 text-sm text-[var(--color-fg-muted)]">{item.tipo === "fabrica" ? "Fábrica" : "Vendedor"}{item.categoria ? ` · ${item.categoria}` : ""}</p></div></div>{item.contacto && <p className="break-words text-sm"><span className="font-medium">Contacto: </span>{item.contacto}</p>}{item.notas ? <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed">{item.notas}</p> : <p className="text-sm text-[var(--color-fg-muted)]">Sin notas. Podés agregarlas desde Editar.</p>}<div className="flex flex-wrap gap-4 text-sm">{item.tiendaUrl && <a href={item.tiendaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 underline underline-offset-4">Abrir tienda <ExternalLink className="h-4 w-4" /></a>}{item.referenciaUrl && <a href={item.referenciaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 underline underline-offset-4">Ver producto de referencia <ExternalLink className="h-4 w-4" /></a>}</div></div><div className="flex flex-wrap items-start gap-2"><Button variant="outline" disabled={Boolean(busyId)} onClick={() => openForm(item)} icon={<Pencil className="h-4 w-4" />}>Editar</Button><Button variant="ghost" disabled={Boolean(busyId)} onClick={() => { setDeleting(item); setError(""); }} aria-label={`Eliminar ${item.nombre}`} icon={<Trash2 className="h-4 w-4" />} /></div></li>)}</ul>}
        {filtered.length > 12 && <nav aria-label="Páginas de proveedores" className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Página anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Página siguiente</Button></nav>}
      </section>
    </>)}
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title="Descartar los cambios del proveedor" description="Los cambios que hiciste en este formulario no se van a guardar." confirmText="Descartar cambios" cancelText="Seguir editando" onConfirm={closeForm} />
    <ConfirmDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busyId) setDeleting(null); }} title={`Eliminar ${deleting?.nombre || "proveedor"}`} description="Se quitarán de tu agenda sus enlaces, contacto y notas guardadas." confirmText="Eliminar proveedor" loading={Boolean(busyId)} onConfirm={() => void remove()} />
  </main></>;
}
