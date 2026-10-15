"use client";

import { useCallback, useEffect, useState } from "react";
import type { InventoryItem, Marca } from "@/lib/types";
import type { StoreLink } from "@/lib/tiendanube-api";
import { EMPTY_STORE_PROFILE, storePhotos, storeReadiness, storeVariants } from "@/lib/store-product";
import { calcInventoryItem } from "@/lib/inventory";
import { fmtARS } from "@/lib/utils";
import { generarDescripcionTiendaHTML } from "@/lib/descripcion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StoreConnectionSettings } from "@/components/inventario/StoreConnectionSettings";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}
type Session = { configured: boolean; authenticated: boolean; adminConfigured: boolean; storeId?: string };
export function StorePublishDialog({ open, onOpenChange, items, marcas, onChanged, onEdit }: {
  open: boolean; onOpenChange: (open: boolean) => void; items: InventoryItem[]; marcas: Marca[];
  onChanged: () => Promise<void>; onEdit: (item: InventoryItem) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [password, setPassword] = useState("");
  const [links, setLinks] = useState<Record<string, StoreLink>>({});
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"hidden" | "visible" | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);
  const brandFor = (item: InventoryItem) => marcas.find(m => m.id === item.marcaId)?.nombre;
  const visible = readyOnly ? items.filter(i => storeReadiness(i, brandFor(i)).ready) : items;
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
    if (!open) return;
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
  }, [open, refresh]);
  async function login() {
    setBusy(true); setError("");
    try { await json("/api/tiendanube/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); setPassword(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo ingresar"); }
    finally { setBusy(false); }
  }
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
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Preparar productos para Tiendanube</DialogTitle><DialogDescription>Revisá la ficha, el precio publicado y las unidades de cada variante antes de enviarlos.</DialogDescription></DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--color-bg-subtle)] p-3 text-sm">
            <span>{checking ? "Comprobando conexión…" : session?.configured ? "Credenciales configuradas" : "Tiendanube pendiente de conexión. Podés preparar tus productos ahora."}</span>
            <Button size="sm" variant="outline" disabled={busy || checking} onClick={async () => { setChecking(true); setError(""); try { await refresh(); } catch(e) { setError(e instanceof Error ? e.message : "No se pudo comprobar"); } finally { setChecking(false); } }}>Comprobar conexión</Button>
          </div>
          {session?.adminConfigured && !session.authenticated && <div className="flex flex-col items-end gap-3 sm:flex-row">
            <Input label="Contraseña de administración" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} hint="Ingresá para conectar tu tienda y habilitar el envío de productos." />
            <Button disabled={busy || !password || !session.adminConfigured} onClick={login}>Ingresar</Button>
          </div>}
          {session?.authenticated && <StoreConnectionSettings onChanged={refresh} onBusyChange={setBusy} />}
          {session?.authenticated && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { try { await json("/api/tiendanube/session", { method: "DELETE" }); await refresh(); } catch(e) { setError(e instanceof Error ? e.message : "No se pudo cerrar la sesión"); } }}>Cerrar acceso de publicación</Button>}
          {error && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] p-3 text-sm text-[var(--color-accent)]">{message}</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={readyOnly} onChange={e => setReadyOnly(e.target.checked)} disabled={busy} />Mostrar solo fichas completas</label>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-fg-muted)]">{visible.length} {visible.length === 1 ? "producto" : "productos"} · Fichas completas: {items.filter(i => storeReadiness(i, brandFor(i)).ready).length}</p>
              <div className="max-h-80 space-y-2 overflow-y-auto" aria-label="Productos para revisar">{visible.map(i => {
                const r = storeReadiness(i, brandFor(i));
                return <button key={i.id} type="button" disabled={busy} aria-pressed={item?.id === i.id} onClick={() => { setSelectedId(i.id); setMessage(""); setError(""); }} className={`w-full rounded-lg border p-3 text-left text-sm hover:bg-[var(--color-bg-subtle)] focus-visible:outline-2 ${item?.id === i.id ? "border-[var(--color-border-focus)] bg-[var(--color-bg-subtle)]" : "border-[var(--color-border)]"}`}>
                  <span className="block font-medium">{i.nombre}</span><span className="block text-xs text-[var(--color-fg-muted)]">{r.ready ? "Ficha completa" : `${r.errors.length} datos pendientes`} · {calcInventoryItem(i).stock} unidades</span>
                  {links[i.id]?.product_id && <span className="block text-xs text-[var(--color-fg-muted)]">Vinculado · {links[i.id].visibility === "visible" ? "Publicado" : "Oculto o pendiente"}</span>}
                </button>;
              })}</div>
              {!visible.length && <p className="text-sm">No hay productos en esta selección. Completá sus fichas o quitá el filtro.</p>}
            </div>
            {item && <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-xl font-semibold">{item.nombre}</h3><p className="text-sm text-[var(--color-fg-muted)]">{brand || "Sin marca"} · {item.tienda?.categoria || "Sin categoría"}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => { onOpenChange(false); onEdit(item); }}>Editar ficha</Button></div>
              {photos.length > 0 ? <div className="flex snap-x gap-3 overflow-x-auto">{photos.map((src, i) => <div key={i} className="w-48 shrink-0 snap-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${item.nombre}, foto ${i + 1}`} className="aspect-square w-full rounded-lg bg-[var(--color-bg-subtle)] object-contain" referrerPolicy="no-referrer" />
              </div>)}</div> : <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">Agregá las fotos desde Editar ficha.</p>}
              <details className="min-w-0 space-y-3 text-sm">
                <summary className="cursor-pointer font-medium">Ver descripción que se enviará · {item.tienda?.descripcion.trim() ? "Personalizada" : "Automática"}</summary>
                <div className="max-h-96 overflow-auto rounded-lg bg-white p-4 text-stone-900 break-words" dangerouslySetInnerHTML={{ __html: generarDescripcionTiendaHTML(item, brand) }} />
              </details>
              <dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-[var(--color-fg-muted)]">Precio publicado</dt><dd className="text-xl font-semibold tabular-nums">{fmtARS(variants[0]?.price ?? 0)}</dd></div><div><dt className="text-[var(--color-fg-muted)]">Precio objetivo por transferencia</dt><dd className="font-medium tabular-nums">{fmtARS(item.precioVentaARS)}</dd></div></dl>
              <p className="text-xs text-[var(--color-fg-muted)]">Descuento previsto: {item.tienda?.descuentoPct ?? 0}%. Configurá ese descuento en Tiendanube. El envío actualiza el precio de lista y quita el precio promocional de las variantes enviadas.</p>
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]"><table className="w-full text-sm"><caption className="sr-only">Variantes y stock que se enviarán</caption><thead className="bg-[var(--color-bg-subtle)]"><tr><th className="p-3 text-left">Variante</th><th className="p-3 text-left">SKU</th><th className="p-3 text-right">Stock</th></tr></thead><tbody>{variants.map((v, i) => <tr key={i}><td className="p-3">{v.props.map(p => p.valor).join(" / ") || "Única"}</td><td className="break-all p-3">{v.sku}</td><td className="p-3 text-right tabular-nums">{v.stock}</td></tr>)}</tbody></table></div>
              {categories.length > 0 && <div className="space-y-2"><label htmlFor="remote-category" className="text-sm font-medium">Categoría en Tiendanube</label><select id="remote-category" disabled={busy} value={item.tienda?.categoriaId ?? ""} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm" onChange={async e => {
                const category = categories.find(c => c.id === Number(e.target.value)); if (!category) return;
                setBusy(true); setError("");
                try { await json(`/api/inventario/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tienda: { ...(item.tienda ?? EMPTY_STORE_PROFILE), categoriaId: category.id, categoria: category.name } }) }); await onChanged(); }
                catch(e) { setError(e instanceof Error ? e.message : "No se pudo guardar la categoría"); } finally { setBusy(false); }
              }}><option value="" disabled>Elegí una categoría de la tienda</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
              {readiness && <div className="space-y-2 text-sm" aria-live="polite">{readiness.errors.length > 0 && <div><h4 className="font-medium">Para completar la ficha</h4><ul className="list-disc space-y-1 pl-4">{readiness.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}{readiness.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-[var(--color-warning)]">{readiness.warnings.map(w => <li key={w}>{w}</li>)}</ul>}{readiness.ready && <p className="text-[var(--color-accent)]">La ficha está completa.</p>}</div>}
              {link?.product_id && <p className="text-xs text-[var(--color-fg-muted)]">Producto Tiendanube #{link.product_id}. Último envío: {link.synced_at ? new Date(link.synced_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "pendiente"}.{link.error && ` Último resultado: ${link.error}`}</p>}
              <p className="text-xs text-[var(--color-fg-muted)]">El envío usa el stock de este panel y reemplaza el de las variantes vinculadas en Tiendanube. Las ventas de Tiendanube todavía no vuelven automáticamente al inventario. Revisá las cantidades antes de actualizar.</p>
              <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || checking || !session?.authenticated || !session.configured || !readiness?.ready || !item.tienda?.categoriaId} onClick={() => setConfirm("hidden")}>Guardar oculto</Button><Button variant="primary" disabled={busy || checking || !session?.authenticated || !session.configured || !readiness?.ready || !item.tienda?.categoriaId} onClick={() => setConfirm("visible")}>{busy ? "Enviando…" : link?.product_id ? "Actualizar y publicar" : "Publicar producto"}</Button></div>
            </div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={confirm !== null} onOpenChange={v => { if (!v) setConfirm(null); }} title={confirm === "visible" ? `Publicar ${item?.nombre ?? "producto"}` : `Guardar ${item?.nombre ?? "producto"} oculto`}
      description={`Se enviarán la ficha, las fotos, el precio ${fmtARS(variants[0]?.price ?? 0)} y ${variants.reduce((n,v) => n + v.stock, 0)} unidades de la vista previa. Se reemplazarán precios y stock de las variantes vinculadas. Las fotos quitadas del panel se quitarán de la tienda si fueron subidas por este panel. Revisá antes las ventas recientes en Tiendanube.`}
      variant="primary" confirmText={confirm === "visible" ? "Confirmar publicación" : "Confirmar envío oculto"} onConfirm={send} />
  </>;
}
