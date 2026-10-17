"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { StoreNavigation } from "./StoreNavigation";
import { StorePublishWorkspace } from "@/components/inventario/StorePublishWorkspace";
import type { InventoryItem, Marca } from "@/lib/types";

export function StoreWorkspacePage({ mode }: { mode: "publish" | "catalog" }) {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [loading, setLoading] = useState(mode === "publish");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scoped, setScoped] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (mode !== "publish") return;
    setError("");
    try {
      const read = async (url: string) => { const response = await fetch(url, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar los productos. Reintentá."); return data; };
      const [inventory, brands] = await Promise.all([read("/api/inventario"), read("/api/marcas")]);
      const ids = new URLSearchParams(window.location.search).get("ids");
      const scope = ids === null ? null : new Set(ids.split(","));
      setScoped(scope !== null);
      setItems(scope ? inventory.items.filter((item: InventoryItem) => scope.has(item.id)) : inventory.items);
      setMarcas(brands.marcas);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo cargar el inventario."); }
    finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!busy) { setNotice(""); return; }
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const navigate = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) { event.preventDefault(); event.stopPropagation(); setNotice("Hay un envío en curso. Esperá a que termine o detené el lote antes de cambiar de página."); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [busy]);
  const publish = mode === "publish";
  return <><Navbar /><main className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-24 sm:px-6">
    <StoreNavigation />
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="text-3xl font-semibold">{publish ? "Publicar productos" : "Editar catálogo de Tiendanube"}</h1><p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">{publish ? "Revisá los productos del inventario y enviá su ficha, fotos, precios y stock a Tiendanube. Cada envío pide confirmación." : "Modificá productos que ya están en Tiendanube, incluidos los que cargaste directamente en la tienda. Revisá el antes y después antes de aplicar los cambios."}</p></div><Link href="/inventario" className="inline-flex min-h-10 items-center text-sm underline underline-offset-4">Volver al inventario</Link></header>
    {scoped && <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm">Estás trabajando con {items.length} {items.length === 1 ? "producto elegido" : "productos elegidos"} desde Inventario. <a href="/tiendanube/publicar" className="underline underline-offset-4">Ver todo el inventario</a></p>}
    {notice && <p role="status" className="rounded-lg bg-[var(--color-warning-soft)] p-4 text-sm text-[var(--color-warning)]">{notice}</p>}
    {error && <div role="alert" className="space-y-3 rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]"><p>{error}</p>{!busy && <Button variant="outline" onClick={() => void load()}>Reintentar carga</Button>}</div>}
    {loading ? <p role="status" className="py-8 text-sm">Cargando productos del inventario…</p> : <StorePublishWorkspace mode={mode} items={items} marcas={marcas} onChanged={load} onBusyChange={setBusy} onEdit={item => router.push(`/inventario?editar=${encodeURIComponent(item.id)}&volver=${encodeURIComponent(window.location.pathname + window.location.search)}`)} />}
  </main></>;
}
