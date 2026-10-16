"use client";
import { useRef, useState } from "react";
import type { InventoryItem, Marca } from "@/lib/types";
import type { StoreLink } from "@/lib/tiendanube-api";
import { storeReadiness, storeVariants } from "@/lib/store-product";
import { fmtARS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function StoreInventoryBatch({ items, marcas, links, storeId, enabled, busy, onBusyChange, onRefresh }: {
  items: InventoryItem[]; marcas: Marca[]; links: Record<string, StoreLink>; storeId?: string;
  enabled: boolean; busy: boolean; onBusyChange: (busy: boolean) => void; onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState<"visible" | "hidden" | null>(null);
  const [progress, setProgress] = useState("");
  const stop = useRef(false);
  const ready = (i: InventoryItem) => storeReadiness(i, marcas.find(m => m.id === i.marcaId)?.nombre).ready && Boolean(i.tienda?.categoriaId);
  const chosen = items.filter(i => selected.has(i.id) && ready(i));
  async function run() {
    if (!confirm || !storeId) return;
    const publish = confirm === "visible"; setConfirm(null);
    const jobs = chosen.map(i => ({ id: i.id, name: i.nombre, updatedAt: i.updatedAt, productId: links[i.id]?.product_id || undefined }));
    stop.current = false; setRunning(true); onBusyChange(true); setFailed([]); setResults({});
    const errors: string[] = [];
    const processed = new Set<string>();
    try {
      for (const [index, job] of jobs.entries()) {
        if (stop.current) break;
        setProgress(`Procesando ${index + 1} de ${jobs.length}: ${job.name}`);
        try {
          const response = await fetch("/api/tiendanube", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: job.id, updatedAt: job.updatedAt, publish, storeId, ...(job.productId ? { productId: job.productId } : {}) }) });
          const data = await response.json();
          if (!response.ok) {
            if ([401, 403, 429, 503].includes(response.status) || String(data.error).includes("tienda conectada cambió")) stop.current = true;
            throw new Error(data.error || "No se pudo enviar");
          }
          setResults(previous => ({ ...previous, [job.id]: `${publish ? "Publicado" : "Guardado oculto"} · #${data.productId}` }));
        } catch (e) {
          errors.push(job.id); setResults(previous => ({ ...previous, [job.id]: `Error: ${e instanceof Error ? e.message : "No se pudo enviar"}` }));
        }
        processed.add(job.id);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setFailed(errors);
      const pending = jobs.filter(j => !processed.has(j.id)).map(j => j.id);
      setSelected(new Set([...errors, ...pending]));
      if (pending.length) setResults(old => ({ ...old, ...Object.fromEntries(pending.map(id => [id, "Pendiente: lote detenido"])) }));
      setProgress(stop.current ? "Lote detenido. Los productos terminados conservan su resultado; los demás quedan pendientes." : `Lote terminado: ${jobs.length - errors.length} completados y ${errors.length} con error.`);
      await onRefresh();
    } catch { setProgress("El envío terminó, pero no se pudo refrescar la lista. Comprobá la conexión antes de continuar."); }
    finally { setRunning(false); onBusyChange(false); }
  }
  return <details className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
    <summary className="cursor-pointer text-sm font-semibold">Publicación masiva · {items.length} productos en esta selección</summary>
    <p className="text-sm text-[var(--color-fg-muted)]">Elegí los productos listos para crear o actualizar en Tiendanube. Se envían ficha, fotos, precios y stock del inventario.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setSelected(new Set(items.filter(ready).map(i => i.id)))}>Seleccionar listos</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())}>Quitar selección del lote</Button>
      {!!failed.length && <Button size="sm" variant="outline" disabled={busy} onClick={() => setSelected(new Set(failed))}>Seleccionar fallidos</Button>}
    </div>
    <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><caption className="sr-only">Vista previa de publicación masiva</caption><thead><tr><th className="p-2 text-left">Elegir</th><th className="p-2 text-left">Producto y acción</th><th className="p-2 text-right">Precio de lista</th></tr></thead><tbody>{items.map(i => {
      const valid = ready(i); const errors = storeReadiness(i, marcas.find(m => m.id === i.marcaId)?.nombre).errors;
      return <tr key={i.id} className="border-t border-[var(--color-border)]"><td className="p-2"><input type="checkbox" aria-label={`Incluir ${i.nombre} en el lote`} disabled={busy || !valid} checked={selected.has(i.id)} onChange={e => setSelected(old => { const next = new Set(old); e.target.checked ? next.add(i.id) : next.delete(i.id); return next; })} /></td>
        <td className="p-2"><span className="block font-medium">{i.nombre}</span><span className="block text-xs text-[var(--color-fg-muted)]">{valid ? links[i.id]?.product_id ? `Actualizar #${links[i.id].product_id}` : "Crear producto" : [...errors, ...(!i.tienda?.categoriaId ? ["Revisá la categoría en Tiendanube"] : [])].join(". ")}</span>
          {results[i.id] && <span className="block text-xs" role="status">{results[i.id]}</span>}</td><td className="p-2 text-right tabular-nums">{fmtARS(storeVariants(i)[0]?.price ?? 0)}</td></tr>;
    })}</tbody></table></div>
    <p className="text-xs text-[var(--color-fg-muted)]">El lote reemplaza el stock de las variantes vinculadas. Revisá las ventas recientes. Mantené esta pantalla abierta hasta terminar.</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !enabled || !chosen.length} onClick={() => setConfirm("visible")}>Publicar {chosen.length} seleccionados</Button>
      <Button variant="outline" disabled={busy || !enabled || !chosen.length} onClick={() => setConfirm("hidden")}>Guardar {chosen.length} ocultos</Button>
      {running && <Button variant="outline" onClick={() => { stop.current = true; }}>Detener después del producto actual</Button>}
    </div>
    {progress && <p role="status" className="text-sm">{progress}</p>}
    <ConfirmDialog open={confirm !== null} onOpenChange={v => { if (!v) setConfirm(null); }} title={`${confirm === "visible" ? "Publicar" : "Guardar ocultos"} ${chosen.length} productos`}
      description="Se enviarán los productos marcados de la vista previa, con sus fotos, precios y stock. Cada producto tendrá su propio resultado; los errores no deshacen los que ya terminaron."
      variant="primary" confirmText="Confirmar lote de publicación" onConfirm={run} />
  </details>;
}
