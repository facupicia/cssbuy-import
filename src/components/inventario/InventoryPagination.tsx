"use client";
import { Button } from "@/components/ui/Button";

export function InventoryPagination({ page, pages, from, to, total, onPage }: { page: number; pages: number; from: number; to: number; total: number; onPage: (page: number) => void }) {
  const numbers = Array.from(new Set([1, ...Array.from({ length: 3 }, (_, i) => page + i - 1).filter(p => p > 1 && p < pages), pages])).sort((a, b) => a - b);
  return <nav aria-label="Paginación de productos" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
    <p role="status" className="text-sm tabular-nums">{from}–{to} de {total} productos</p>
    <div className="flex flex-wrap items-center gap-1"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => onPage(page - 1)}>Anterior</Button>{numbers.map((n, i) => <span key={n} className="inline-flex items-center gap-1">{i > 0 && n - numbers[i - 1] > 1 && <span aria-hidden="true" className="px-1 text-xs">…</span>}<button type="button" aria-label={`Página ${n}`} aria-current={page === n ? "page" : undefined} onClick={() => onPage(n)} className={`h-9 min-w-9 rounded-lg px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 ${page === n ? "bg-[var(--color-fg)] font-semibold text-[var(--color-bg)]" : "hover:bg-[var(--color-bg-subtle)]"}`}>{n}</button></span>)}<Button size="sm" variant="outline" disabled={page === pages} onClick={() => onPage(page + 1)}>Siguiente</Button></div>
  </nav>;
}
