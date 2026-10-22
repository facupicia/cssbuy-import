"use client";

import { useRef, useState } from "react";
import type { InventoryItem } from "@/lib/types";
import type { StoreLink } from "@/lib/tiendanube-api";
import { storePhotos, validPhoto } from "@/lib/store-product";
import type { CatalogProduct } from "@/lib/store-catalog-plan";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isInventoryPhotoUrl } from "@/lib/inventory-media";

export function StorePhotoUpdates({ items, links, storeId, enabled, busy, onBusyChange, onRefresh }: {
  items: InventoryItem[]; links: Record<string, StoreLink>; storeId?: string;
  enabled: boolean; busy: boolean; onBusyChange: (busy: boolean) => void; onRefresh: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<(CatalogProduct & { linkedItemId?: string; thumbnail?: string })[]>([]);
  const [catalogPage, setCatalogPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  async function loadCatalog() {
    setLoadingCatalog(true); setCatalogError("");
    try {
      const response = await fetch(`/api/tiendanube/catalog?page=${catalogPage + 1}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo consultar la tienda");
      if (data.storeId !== storeId) throw new Error("La tienda conectada cambió. Comprobá la conexión.");
      setCatalog(old => [...old.filter(product => !data.products.some((next: CatalogProduct) => next.id === product.id)), ...data.products]);
      setCatalogPage(old => old + 1); setHasMore(data.hasMore);
    } catch (error) { setCatalogError((error as Error).message); }
    finally { setLoadingCatalog(false); }
  }
  const productId = (item: InventoryItem) => links[item.id]?.product_id || matches[item.id];
  const eligible = items.filter(item => productId(item) && storePhotos(item).length > 0 && storePhotos(item).length <= 9 && storePhotos(item).every(photo => validPhoto(photo) || Boolean(item.mediaDeferred && isInventoryPhotoUrl(photo))));
  const selected = selection ?? new Set(eligible.map(item => item.id));
  const chosen = eligible.filter(item => selected.has(item.id));

  async function run() {
    if (!storeId || !enabled || busy || !chosen.length) return;
    const jobs = chosen.map(item => ({ id: item.id, name: item.nombre, updatedAt: item.updatedAt, productId: productId(item)!, linkExisting: !links[item.id]?.product_id }));
    const targetStore = storeId;
    setConfirm(false); setRunning(true); onBusyChange(true); setResults({});
    stop.current = false;
    const pending = new Set(jobs.map(job => job.id));
    let completed = 0, failed = 0;
    try {
      for (const [index, job] of jobs.entries()) {
        if (stop.current) break;
        setProgress(`Actualizando ${index + 1} de ${jobs.length}: ${job.name}`);
        try {
          const response = await fetch("/api/tiendanube/photos", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: job.id, updatedAt: job.updatedAt, productId: job.productId, storeId: targetStore, ...(job.linkExisting ? { linkExisting: true } : {}) }) });
          const data = await response.json();
          if (!response.ok) {
            if ([401, 403, 429].includes(response.status) || response.status >= 500 || String(data.error).includes("tienda conectada cambió")) stop.current = true;
            throw new Error(data.error || "No se pudieron actualizar las fotos");
          }
          pending.delete(job.id); completed++;
          setResults(old => ({ ...old, [job.id]: `Fotos actualizadas · ${data.uploaded} ${data.uploaded === 1 ? "nueva" : "nuevas"} · #${data.productId}` }));
        } catch (error) {
          failed++;
          setResults(old => ({ ...old, [job.id]: error instanceof Error ? error.message : "No se pudo comprobar el resultado. Reintentá este producto." }));
          // A lost connection may also mean an expired login. Preserve the queue.
          if (error instanceof TypeError || error instanceof SyntaxError) stop.current = true;
        }
        if (index < jobs.length - 1 && !stop.current) await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setSelection(pending);
      setProgress(`${completed} productos actualizados, ${failed} con error y ${pending.size - failed} pendientes.${stop.current ? " El lote se detuvo; podés reintentar los pendientes." : ""}`);
      try { await onRefresh(); }
      catch { setProgress(old => `${old} No se pudo refrescar la lista. Los resultados del envío se conservan.`); }
    } finally { setRunning(false); onBusyChange(false); }
  }

  return <section aria-labelledby="photo-updates-title" className="space-y-4 rounded-xl border border-[var(--color-border)] p-4 sm:p-6">
    <div className="space-y-2"><h2 id="photo-updates-title" className="text-xl font-semibold">Actualizar fotos en Tiendanube</h2>
      <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Enviá las fotos guardadas en el inventario a los productos ya vinculados. El orden del panel define la portada. Se conservan los precios, el stock, la descripción y el estado de publicación.</p>
      <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Las fotos que quitaste del panel se retiran de Tiendanube si las subió este panel. Las cargadas directamente en la tienda se conservan.</p></div>
    {items.some(item => !links[item.id]?.product_id) && <div className="space-y-3 rounded-lg bg-[var(--color-bg-subtle)] p-4">
      <p className="text-sm">Para los productos que cargaste antes en Tiendanube, elegí la publicación existente en su fila. Se guardará el vínculo cuando confirmes el envío de fotos.</p>
      {(!catalogPage || hasMore) && <Button size="sm" variant="outline" disabled={busy || !enabled || loadingCatalog} onClick={() => void loadCatalog()}>{loadingCatalog ? "Consultando catálogo…" : catalogPage ? "Cargar más productos de la tienda" : "Buscar productos ya publicados"}</Button>}
      {catalogError && <p role="alert" className="text-sm text-[var(--color-danger)]">{catalogError}</p>}
    </div>}
    <div className="flex flex-wrap gap-3"><Button size="sm" variant="outline" disabled={busy || !enabled} onClick={() => setSelection(new Set(eligible.map(item => item.id)))}>Seleccionar listos con fotos</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelection(new Set())}>Quitar selección</Button></div>
    <div className="max-h-96 overflow-auto"><table className="w-full text-sm"><caption className="sr-only">Productos y fotos que se actualizarán</caption><thead><tr><th className="p-3 text-left">Elegir</th><th className="p-3 text-left">Producto</th><th className="p-3 text-right">Fotos</th></tr></thead><tbody>{items.map(item => {
      const link = links[item.id]; const photos = storePhotos(item); const valid = eligible.some(candidate => candidate.id === item.id);
      return <tr key={item.id} className="border-t border-[var(--color-border)]"><td className="p-3"><input type="checkbox" aria-label={`Actualizar fotos de ${item.nombre}`} checked={selected.has(item.id)} disabled={busy || !enabled || !valid} onChange={e => setSelection(() => { const next = new Set(selected); if (e.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /></td>
        <td className="p-3"><span className="block font-semibold">{item.nombre}</span><span className="block text-xs text-[var(--color-fg-muted)]">{!productId(item) ? "Elegí su publicación existente o revisá el vínculo" : !photos.length ? "Guardá al menos una foto en el inventario" : !valid ? "Revisá el formato de las fotos" : `${link?.product_id ? "Actualizar producto" : "Vincular y actualizar"} #${productId(item)}`}</span>
          {!link?.product_id && catalogPage > 0 && <div className="mt-3 max-w-lg space-y-2">
            <p className="text-xs text-[var(--color-fg-muted)]">Inventario: {item.sku || "Sin SKU"} · {item.variante || "Variante única"}{item.talles?.length ? ` · ${item.talles.map(size => size.talle).join(" / ")}` : ""}</p>
            <select aria-label={`Publicación existente para ${item.nombre}`} className="min-h-10 w-full max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 text-sm" disabled={busy || !enabled} value={matches[item.id] || ""} onChange={e => {
              const value = e.target.value;
              setMatches(old => ({ ...old, [item.id]: value }));
              setSelection(old => { if (!old) return null; const next = new Set(old); if (value) next.add(item.id); else next.delete(item.id); return next; });
            }}><option value="">Elegí el producto de Tiendanube</option>{catalog.filter(product => (!product.linkedItemId || product.linkedItemId === item.id)
              && !Object.entries(matches).some(([other, target]) => other !== item.id && target === String(product.id))
              && !Object.entries(links).some(([other, target]) => other !== item.id && target.product_id === String(product.id))).map(product => <option key={product.id} value={product.id}>{product.name} · #{product.id} · {product.variants.map(variant => `${variant.label}${variant.sku ? ` (${variant.sku})` : ""}`).join(" / ")}</option>)}</select>
            {matches[item.id] && <p className="text-xs">Se vinculará con #{matches[item.id]} al confirmar.</p>}
            {catalog.find(product => String(product.id) === matches[item.id])?.thumbnail && <img src={catalog.find(product => String(product.id) === matches[item.id])!.thumbnail} alt="Foto actual de la publicación elegida" className="h-16 w-16 rounded-lg object-contain" referrerPolicy="no-referrer" />}
          </div>}
          {link?.photos_synced_at && <span className="block text-xs text-[var(--color-fg-muted)]">Último envío de fotos: {new Date(link.photos_synced_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</span>}
          {results[item.id] && <p role="status" className="mt-2 max-w-lg text-xs">{results[item.id]}</p>}</td><td className="p-3 text-right tabular-nums">{photos.length}</td></tr>;
    })}</tbody></table></div>
    {!eligible.length && <p className="text-sm">No hay productos listos para enviar en esta selección. Guardá las fotos y elegí su publicación existente si todavía no están vinculados.</p>}
    <div className="flex flex-wrap gap-3"><Button variant="primary" disabled={busy || !enabled || !chosen.length} onClick={() => setConfirm(true)}>Actualizar fotos de {chosen.length} {chosen.length === 1 ? "producto" : "productos"}</Button>
      {running && <Button variant="outline" onClick={() => { stop.current = true; }}>Detener después del producto actual</Button>}</div>
    {progress && <p role="status" className="text-sm">{progress}</p>}
    <p className="text-xs text-[var(--color-fg-muted)]">Mantené esta pantalla abierta hasta terminar. Los productos con error o pendientes quedan seleccionados para reintentar.</p>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Actualizar fotos de ${chosen.length} productos`}
      description="Se guardarán los vínculos que elegiste con productos existentes y se enviarán las fotos de los productos marcados, con el orden del inventario. Se retirarán solo las fotos que este panel había subido y que ya quitaste del inventario. Cada producto tendrá su propio resultado."
      variant="primary" confirmText="Confirmar actualización de fotos" onConfirm={() => void run()} />
  </section>;
}
