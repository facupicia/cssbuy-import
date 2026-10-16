"use client";
import { useEffect, useState } from "react";
import { countdownText, videoSource, type StoreWidget } from "@/lib/store-widgets";
export function WidgetPreview({ widget: w, accent }: { widget: StoreWidget; accent: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <section aria-label="Vista previa del bloque" className="rounded-xl border border-[#dedede] bg-white p-6 text-[#181818] space-y-4" style={{ overflowWrap: "anywhere" }}>
    <h3 className="text-lg font-semibold" style={{ color: accent }}>{w.title || "Completá el título"}</h3>
    {w.text && <p className="text-sm whitespace-pre-wrap">{w.text}</p>}
    {w.kind === "faq" && w.entries.map((entry, i) => <details key={i} className="border border-[#dedede] rounded-lg p-3"><summary className="font-medium text-sm cursor-pointer">{entry.title || "Pregunta"}</summary><p className="text-sm pt-3 whitespace-pre-wrap">{entry.text}</p></details>)}
    {w.kind === "payments" && <div className="flex flex-wrap gap-3">{w.entries.map((entry, i) => <div key={i} className="border border-[#dedede] rounded-lg p-3"><p className="font-semibold text-sm">{entry.title}</p><p className="text-sm">{entry.text}</p></div>)}</div>}
    {w.kind === "countdown" && <p className="text-2xl font-semibold tabular-nums" aria-live="off">{w.endsAt && now ? countdownText(w.endsAt, now) : "Elegí la fecha de finalización"}</p>}
    {w.kind === "videos" && <div className="flex gap-4 overflow-x-auto pb-3">{w.entries.length ? w.entries.map((entry, i) => {
      let valid = false; let youtube = false; try { youtube = videoSource(entry.url) === "youtube"; valid = true; } catch {}
      return <div key={i} className="w-60 shrink-0 space-y-2">{valid && !youtube ? <video className="w-full rounded-lg bg-[#181818] aspect-[9/16]" controls preload="none" src={entry.url} aria-label={entry.title} /> : <div className="aspect-[9/16] bg-[#f5f5f5] rounded-lg flex items-center justify-center p-4 text-sm">{youtube ? <a href={entry.url} target="_blank" rel="noreferrer" className="underline">Ver en YouTube</a> : "Agregá un enlace de video válido"}</div>}<p className="text-sm font-medium">{entry.title}</p></div>;
    }) : <p className="text-sm">Agregá videos para ver el slider.</p>}</div>}
  </section>;
}
