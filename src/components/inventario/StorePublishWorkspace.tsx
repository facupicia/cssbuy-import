"use client";

import { useCallback, useEffect, useState } from "react";
import type { InventoryItem, Marca } from "@/lib/types";
import type { StoreLink } from "@/lib/tiendanube-api";
import { EMPTY_STORE_PROFILE, storePhotos, storeReadiness, storeVariants } from "@/lib/store-product";
import { calcInventoryItem } from "@/lib/inventory";
import { fmtARS } from "@/lib/utils";
import { generarDescripcionTiendaHTML } from "@/lib/descripcion";
import { withStoreCategory } from "@/lib/store-category";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Link from "next/link";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StoreInventoryBatch } from "@/components/inventario/StoreInventoryBatch";
import { StoreCatalogPanel } from "@/components/inventario/StoreCatalogPanel";
import { Segmented } from "@/components/ui/Segmented";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}
type Session = { configured: boolean; authenticated: boolean; adminConfigured: boolean; storeId?: string };
export function StorePublishWorkspace({ mode, items, marcas, onChanged, onEdit, onBusyChange }: {
  mode: "publish" | "catalog"; items: InventoryItem[]; marcas: Marca[]; onBusyChange: (busy: boolean) => void;
  onChanged: () => Promise<void>; onEdit: (item: InventoryItem) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [links, setLinks] = useState<Record<string, StoreLink>>({});
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"hidden" | "visible" | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);
  const [view, setView] = useState("single");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const brandFor = (item: InventoryItem) => marcas.find(m => m.id === item.marcaId)?.nombre;
  const categorizedItems = items.map(i => withStoreCategory(i, categories));
  const visible = categorizedItems.filter(i => (!readyOnly || storeReadiness(i, brandFor(i)).ready)
    && (!search.trim() || `${i.nombre} ${i.sku ?? ""} ${brandFor(i) ?? ""}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")))
    && (status === "all" || (status === "new" ? !links[i.id]?.product_id : Boolean(links[i.id]?.product_id))));
  const item = visible.find(i => i.id === selectedId) ?? visible[0];
  const brand = item ? brandFor(item) : undefined;
  const readiness = item ? storeReadiness(item, brand) : null;
  const variants = item ? storeVariants(item) : [];
  const photos = item ? storePhotos(item) : [];
  const link = item ? links[item.id] : undefined;
  const refresh = useCallback(async () => {
    const s = await json<Session>("/api/tiendanube/session");
    setSession(s);
    if (s.authenticated) {
      const l = await json<{ links: Record<string, StoreLink> }>("/api/tiendanube"); setLinks(l.links);
      if (s.configured) {
        const c = await json<{ categories: { id: number; name: string }[] }>("/api/tiendanube?resource=categories"); setCategories(c.categories);
      } else setCategories([]);
    } else { setLinks({}); setCategories([]); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const result = new URLSearchParams(window.location.search).get("tiendanube");
    if (result) {
      const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete("tiendanube");
      window.history.replaceState(window.history.state, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }
    setChecking(true);
    setError(result === "failed" ? "No se pudo autorizar la tienda. Revisá la app, los permisos de productos y que hayas ingresado a la tienda correcta; luego volvé a intentar." : "");
    setMessage(result === "connected" ? "Tiendanube conectada. Ya podés elegir categorías y preparar un producto para enviarlo." : result === "cancelled" ? "La autorización fue cancelada. Podés retomarla cuando quieras." : "");
    refresh().catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [refresh]);
  async function send() {
    if (!item || !confirm) return;
    const publish = confirm === "visible";
    setConfirm(null); setBusy(true); setError(""); setMessage("");
    try {
      await json("/api/tiendanube", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: item.id, publish, updatedAt: item.updatedAt, storeId: session?.storeId, ...(link?.product_id ? { productId: link.product_id } : {}),
      }) });
      setMessage(publish ? "Producto actualizado y publicado en Tiendanube" : "Producto guardado en Tiendanube como oculto");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar"); }
    finally {
      try { await refresh(); } catch { /* Keep the actionable operation error visible. */ }
      setBusy(false);
    }
  }
  return <>
    <div className="space-y-6" aria-busy={busy}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--color-bg-subtle)] p-3 text-sm">
            <span>{checking ? "Comprobando conexión…" : session?.configured ? "Tiendanube conectada" : "Tiendanube pendiente de conexión. Podés preparar tus productos ahora."}</span>
            <Button size="sm" variant="outline" disabled={busy || checking} onClick={async () => { setChecking(true); setError(""); try { await refresh(); } catch(e) { setError(e instanceof Error ? e.message : "No se pudo comprobar"); } finally { setChecking(false); } }}>Comprobar conexión</Button>
          </div>
          {session && !session.authenticated && <AdminAccessNotice returnTo={typeof window !== "undefined" ? window.location.pathname + window.location.search : "/tiendanube/publicar"} />}
          {session?.authenticated && !session.configured && <p className="rounded-lg border border-[var(--color-border)] p-4 text-sm">Conectá tu tienda desde <Link href="/configuracion#tiendanube" className="underline underline-offset-4">Configuración de Tiendanube</Link> para habilitar los envíos.</p>}
          {error && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] p-3 text-sm text-[var(--color-accent)]">{message}</p>}
          {mode === "catalog" && (session?.authenticated && session.configured && session.storeId
            ? <StoreCatalogPanel storeId={session.storeId} categories={categories} onBusyChange={setBusy} />
            : <p className="text-sm">Ingresá y conectá tu tienda para consultar y editar su catálogo.</p>)}
          {mode === "publish" && <div className="space-y-6">
          <fieldset disabled={busy}><legend className="sr-only">Modo de publicación</legend><Segmented value={view} onChange={value => { if (!busy) setView(value); }} options={[{ value: "single", label: "Revisar un producto" }, { value: "batch", label: "Publicar en lote" }]} /></fieldset>
          <div className="grid items-end gap-4 sm:grid-cols-2"><Input label="Buscar en esta selección" value={search} disabled={busy} onChange={e => setSearch(e.target.value)} placeholder="Nombre, marca o SKU" /><label className="space-y-2 text-sm"><span className="block font-medium">Estado en Tiendanube</span><select className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3" value={status} disabled={busy || !session?.authenticated || checking} onChange={e => setStatus(e.target.value)}><option value="all">Todos los productos</option><option value="new">Nuevos, sin vincular</option><option value="linked">Vinculados, para actualizar</option></select></label></div>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={readyOnly} onChange={e => setReadyOnly(e.target.checked)} disabled={busy} />Mostrar solo fichas completas</label>
          {view === "batch" ?
          <StoreInventoryBatch items={visible} marcas={marcas} links={links} storeId={session?.storeId} enabled={Boolean(session?.authenticated && session.configured && !checking)} busy={busy} onBusyChange={setBusy} onRefresh={async () => { await refresh(); await onChanged(); }} />
          : <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-fg-muted)]">{visible.length} {visible.length === 1 ? "producto" : "productos"} · Fichas completas: {categorizedItems.filter(i => storeReadiness(i, brandFor(i)).ready).length}</p>
              <div className="max-h-80 space-y-2 overflow-y-auto md:sticky md:top-24 md:max-h-[70dvh]" aria-label="Productos para revisar">{visible.map(i => {
                const r = storeReadiness(i, brandFor(i));
                return <button key={i.id} type="button" disabled={busy} aria-pressed={item?.id === i.id} onClick={() => { setSelectedId(i.id); setMessage(""); setError(""); }} className={`w-full rounded-lg border p-3 text-left text-sm hover:bg-[var(--color-bg-subtle)] focus-visible:outline-2 ${item?.id === i.id ? "border-[var(--color-border-focus)] bg-[var(--color-bg-subtle)]" : "border-[var(--color-border)]"}`}>
                  <span className="block font-medium">{i.nombre}</span><span className="block text-xs text-[var(--color-fg-muted)]">{r.ready ? "Ficha completa" : `${r.errors.length} datos pendientes`} · {calcInventoryItem(i).stock} unidades</span>
                  {links[i.id]?.product_id && <span className="block text-xs text-[var(--color-fg-muted)]">Vinculado · {links[i.id].visibility === "visible" ? "Publicado" : "Oculto o pendiente"}</span>}
                </button>;
              })}</div>
              {!visible.length && <p className="text-sm">No hay productos en esta selección. Completá sus fichas o quitá el filtro.</p>}
            </div>
            {item && <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-xl font-semibold">{item.nombre}</h3><p className="text-sm text-[var(--color-fg-muted)]">{brand || "Sin marca"} · {item.tienda?.categoria || "Sin categoría"}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(item)}>Editar ficha en inventario</Button></div>
              {readiness && <div className="space-y-2 text-sm" aria-live="polite">{readiness.errors.length > 0 && <div><h4 className="font-medium">Para completar la ficha</h4><ul className="list-disc space-y-1 pl-4">{readiness.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}{readiness.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-[var(--color-warning)]">{readiness.warnings.map(w => <li key={w}>{w}</li>)}</ul>}{readiness.ready && <p className="text-[var(--color-accent)]">La ficha está completa.</p>}</div>}
              {photos.length > 0 ? <div className="flex snap-x gap-3 overflow-x-auto">{photos.map((src, i) => <div key={i} className="w-48 shrink-0 snap-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${item.nombre}, foto ${i + 1}`} className="aspect-square w-full rounded-lg bg-[var(--color-bg-subtle)] object-contain" referrerPolicy="no-referrer" />
              </div>)}</div> : <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">Agregá las fotos desde Editar ficha en inventario.</p>}
              <dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[var(--color-fg-muted)]">Precio publicado</dt><dd className="text-xl font-semibold tabular-nums">{fmtARS(variants[0]?.price ?? 0)}</dd></div><div><dt className="text-[var(--color-fg-muted)]">Precio objetivo por transferencia</dt><dd className="font-medium tabular-nums">{fmtARS(item.precioVentaARS)}</dd></div></dl>
              <p className="text-xs text-[var(--color-fg-muted)]">Descuento previsto: {item.tienda?.descuentoPct ?? EMPTY_STORE_PROFILE.descuentoPct}%. Configurá ese descuento en Tiendanube. El envío actualiza el precio de lista y quita el precio promocional de las variantes enviadas.</p>
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]"><table className="w-full text-sm"><caption className="sr-only">Variantes y stock que se enviarán</caption><thead className="bg-[var(--color-bg-subtle)]"><tr><th className="p-3 text-left">Variante</th><th className="p-3 text-left">SKU</th><th className="p-3 text-right">Stock</th></tr></thead><tbody>{variants.map((v, i) => <tr key={i}><td className="p-3">{v.props.map(p => p.valor).join(" / ") || "Única"}</td><td className="break-all p-3">{v.sku}</td><td className="p-3 text-right tabular-nums">{v.stock}</td></tr>)}</tbody></table></div>
              {categories.length > 0 && <div className="space-y-2"><label htmlFor="remote-category" className="text-sm font-medium">Categoría en Tiendanube</label><select id="remote-category" disabled={busy} value={item.tienda?.categoriaId ?? ""} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm" onChange={async e => {
                const category = categories.find(c => c.id === Number(e.target.value)); if (!category) return;
                setBusy(true); setError("");
                try { await json(`/api/inventario/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tienda: { ...(item.tienda ?? EMPTY_STORE_PROFILE), categoriaId: category.id, categoria: category.name } }) }); await onChanged(); }
                catch(e) { setError(e instanceof Error ? e.message : "No se pudo guardar la categoría"); } finally { setBusy(false); }
              }}><option value="" disabled>Elegí una categoría de la tienda</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{!item.tienda?.categoriaId && item.tienda?.categoria && <p className="text-xs text-[var(--color-warning)]">No se encontró una categoría única para {item.tienda.categoria}. Creala en Tiendanube o elegí otra categoría.</p>}</div>}

              {link?.product_id && <p className="text-xs text-[var(--color-fg-muted)]">Producto Tiendanube #{link.product_id}. Último envío: {link.synced_at ? new Date(link.synced_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "pendiente"}.{link.error && ` Último resultado: ${link.error}`}</p>}
              <p className="text-xs text-[var(--color-fg-muted)]">El envío usa el stock de este panel y reemplaza el de las variantes vinculadas en Tiendanube. Las ventas de Tiendanube todavía no vuelven automáticamente al inventario. Revisá las cantidades antes de actualizar.</p>
              <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || checking || !session?.authenticated || !session.configured || !readiness?.ready || !item.tienda?.categoriaId} onClick={() => setConfirm("hidden")}>Guardar oculto</Button><Button variant="primary" disabled={busy || checking || !session?.authenticated || !session.configured || !readiness?.ready || !item.tienda?.categoriaId} onClick={() => setConfirm("visible")}>{busy ? "Enviando…" : link?.product_id ? "Actualizar y publicar" : "Publicar producto"}</Button></div>
              <section aria-label="Descripción que se enviará" className="min-w-0 space-y-3 text-sm">
                <h4 className="font-medium">Descripción que se enviará · {item.tienda?.descripcion.trim() ? "Personalizada" : "Automática"}</h4>
                <div className="overflow-x-auto rounded-lg bg-white p-4 text-stone-900 break-words" dangerouslySetInnerHTML={{ __html: generarDescripcionTiendaHTML(item, brand) }} />
              </section>
            </div>}
          </div>}
          </div>}
    </div>
    <ConfirmDialog open={confirm !== null} onOpenChange={v => { if (!v) setConfirm(null); }} title={confirm === "visible" ? `Publicar ${item?.nombre ?? "producto"}` : `Guardar ${item?.nombre ?? "producto"} oculto`}
      description={`Se enviarán la ficha, las fotos, el precio ${fmtARS(variants[0]?.price ?? 0)} y ${variants.reduce((n,v) => n + v.stock, 0)} unidades de la vista previa. Se reemplazarán precios y stock de las variantes vinculadas. Las fotos quitadas del panel se quitarán de la tienda si fueron subidas por este panel. Revisá antes las ventas recientes en Tiendanube.`}
      variant="primary" confirmText={confirm === "visible" ? "Confirmar publicación" : "Confirmar envío oculto"} onConfirm={send} />
  </>;
}
