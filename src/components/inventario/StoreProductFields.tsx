"use client";

import { useState } from "react";
import type { StoreProductProfile } from "@/lib/types";
import { EMPTY_STORE_PROFILE, validPhoto } from "@/lib/store-product";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { normalizePhotoFile, normalizePhotoSource } from "@/lib/normalize-photo-client";
import { PRODUCT_PHOTO_SIZE } from "@/lib/photo-format";

export function StoreProductFields({ value, onChange, image, onBusyChange }: {
  value?: StoreProductProfile | null;
  onChange: (value: StoreProductProfile | ((current: StoreProductProfile) => StoreProductProfile)) => void;
  image?: string; onBusyChange?: (busy: boolean) => void;
}) {
  const profile = value ?? EMPTY_STORE_PROFILE;
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [upscaled, setUpscaled] = useState(false);
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const change = <K extends keyof StoreProductProfile>(key: K, v: StoreProductProfile[K]) => onChange(current => ({ ...current, [key]: v }));
  const photos = profile.fotos.length ? profile.fotos : image ? [image] : [];
  function startProcessing() { setBusy(true); onBusyChange?.(true); setError(""); setNotice(""); setUpscaled(false); }
  function stopProcessing() { setBusy(false); onBusyChange?.(false); setProgress(""); }
  async function addUrl() {
    if (!validPhoto(url.trim()) || !url.startsWith("https://")) { setError("Ingresá un enlace HTTPS válido a una foto"); return; }
    if (photos.length >= 9) { setError("Podés guardar hasta 9 fotos"); return; }
    startProcessing(); setProgress("Preparando foto del enlace…");
    try {
      const result = await normalizePhotoSource(url.trim());
      change("fotos", [...new Set([...photos, result.data])]); setUrl(""); setUpscaled(result.upscaled);
      setNotice("Foto agregada en 1280 × 1280 px. Guardá los cambios para conservarla.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir la foto del enlace"); }
    finally { stopProcessing(); }
  }
  async function normalizeAll() {
    startProcessing();
    try {
      const normalized: string[] = [];
      let small = false;
      for (const [index, photo] of photos.entries()) {
        setProgress(`Normalizando foto ${index + 1} de ${photos.length}…`);
        try {
          const result = await normalizePhotoSource(photo);
          normalized.push(result.data); small ||= result.upscaled;
        } catch (e) { throw new Error(`Foto ${index + 1}: ${e instanceof Error ? e.message : "no se pudo procesar"}. La galería anterior se conserva.`); }
      }
      change("fotos", normalized); setUpscaled(small);
      setNotice("Todas las fotos quedaron en 1280 × 1280 px. Revisalas y guardá los cambios para conservarlas.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron normalizar las fotos"); }
    finally { stopProcessing(); }
  }
  return <section className="space-y-4 rounded-lg border border-[var(--color-border)] p-4" aria-label="Ficha para la tienda">
    <div><h3 className="text-base font-semibold">Ficha para la tienda</h3><p className="text-sm text-[var(--color-fg-muted)]">La descripción y las fotos se muestran a tus clientes. Las notas quedan para uso interno.</p></div>
    <div className="space-y-2">
      <label htmlFor="store-description" className="text-sm font-medium">Descripción pública</label>
      <textarea id="store-description" rows={5} maxLength={10000} value={profile.descripcion} onChange={e => change("descripcion", e.target.value)}
        placeholder="Describí el material, el calce y los detalles de la prenda." className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="Categoría para exportar" value={profile.categoria} onChange={e => onChange({ ...profile, categoria: e.target.value, categoriaId: null })} placeholder="Ropa > Camperas" hint="La categoría de Tiendanube se elige al conectar." />
      <Input label="Peso de envío (kg)" type="number" min={0} max={1000} step="0.01" value={profile.pesoKg || ""} onChange={e => change("pesoKg", Number(e.target.value))} hint="Incluí el embalaje para calcular el envío." />
      <Input label="Descuento por transferencia (%)" type="number" min={0} max={90} value={profile.descuentoPct} onChange={e => change("descuentoPct", Number(e.target.value))} hint="El precio publicado se ajusta para conservar tu precio de venta." />
      <Input label="Redondear precio a ($)" type="number" min={0} max={100000} step={100} value={profile.redondearA} onChange={e => change("redondearA", Number(e.target.value))} hint="Usá 0 para no redondear." />
    </div>
    <div className="space-y-3">
      <div><h4 className="text-sm font-medium">Fotos del producto ({photos.length}/9)</h4><p className="text-xs text-[var(--color-fg-muted)]">Cargá más fotos y elegí la portada antes de enviar el producto a Tiendanube.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--color-bg-subtle)] p-3">
        <div className="space-y-1"><p className="text-sm font-medium">Formato uniforme: 1280 × 1280 px</p><p className="text-xs text-[var(--color-fg-muted)]">Fotos centradas, sin recortar ni estirar, con márgenes blancos. Las nuevas se adaptan al cargarlas.</p></div>
        <Button type="button" size="sm" variant="outline" disabled={busy || !photos.length} onClick={normalizeAll}>Normalizar todas</Button>
      </div>
      {photos.length > 0 && <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, i) => <li key={`${i}-${photo.slice(-30)}`} className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={`Foto ${i + 1} del producto`} className="aspect-square w-full rounded-lg bg-white object-contain" referrerPolicy="no-referrer" onLoad={e => {
          const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
          setDimensions(current => current[photo]?.width === width && current[photo]?.height === height ? current : { ...current, [photo]: { width, height } });
        }} />
        <p className="text-xs text-[var(--color-fg-muted)]">{i === 0 ? "Portada" : `Foto ${i + 1}`} · {dimensions[photo] ? `${dimensions[photo].width} × ${dimensions[photo].height} px${dimensions[photo].width === PRODUCT_PHOTO_SIZE && dimensions[photo].height === PRODUCT_PHOTO_SIZE ? " · Lista" : " · Sin normalizar"}` : "Cargando dimensiones…"}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={i === 0 || busy} aria-label={`Mover foto ${i + 1} hacia adelante`} onClick={() => { const next = [...photos]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; change("fotos", next); }}>Antes</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Quitar foto ${i + 1}`} onClick={() => change("fotos", photos.filter((_, n) => n !== i))}>Quitar</Button>
        </div>
      </li>)}</ol>}
      <label className="block space-y-2 text-sm font-medium">Subir fotos desde tu equipo
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || photos.length >= 9} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-bg-muted)] file:px-3 file:py-2 file:text-[var(--color-fg)]" onChange={async e => {
          const files = Array.from(e.target.files ?? []); e.target.value = "";
          if (!files.length) return;
          if (photos.length + files.length > 9) { setError("Podés guardar hasta 9 fotos"); return; }
          startProcessing();
          try {
            const converted: string[] = []; let small = false;
            for (const [i, file] of files.entries()) {
              setProgress(`Preparando foto ${i + 1} de ${files.length}…`);
              const result = await normalizePhotoFile(file); converted.push(result.data); small ||= result.upscaled;
            }
            change("fotos", [...photos, ...converted]); setUpscaled(small);
            setNotice(`${converted.length === 1 ? "Foto agregada" : `${converted.length} fotos agregadas`} en 1280 × 1280 px. Guardá los cambios para conservarlas.`);
          }
          catch (e) { setError(e instanceof Error ? e.message : "No se pudieron procesar las fotos"); }
          finally { stopProcessing(); }
        }} />
      </label>
      {busy && <p role="status" className="text-sm">{progress}</p>}
      {notice && <p role="status" className="text-sm text-[var(--color-accent)]">{notice}</p>}
      {upscaled && <p className="text-xs text-[var(--color-warning)]">Había fotos pequeñas: se ajustaron al formato, pero ampliar una imagen no recupera detalle. Revisá su nitidez antes de publicarlas.</p>}
      <div className="flex flex-col items-end gap-2 sm:flex-row"><Input label="O agregar por enlace" disabled={busy} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /><Button type="button" variant="outline" disabled={busy || photos.length >= 9} onClick={addUrl}>Agregar foto</Button></div>
      {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  </section>;
}
