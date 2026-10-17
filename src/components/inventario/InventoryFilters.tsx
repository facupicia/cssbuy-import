"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EMPTY_INVENTORY_FILTERS, type InventoryFilters as Filters } from "@/lib/inventory-list";

export interface FilterOption { value: string; label: string }
type Group = Exclude<keyof Filters, "precioMin" | "precioMax">;
const groups: { key: Group; label: string }[] = [
  { key: "estados", label: "Estado" }, { key: "marcas", label: "Marca" }, { key: "talles", label: "Talle" },
  { key: "colores", label: "Color" }, { key: "categorias", label: "Categoría" }, { key: "origenes", label: "Origen" }, { key: "stock", label: "Disponibilidad" },
];
function MultiFilter({ label, options, selected, onChange }: { label: string; options: FilterOption[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const filtered = options.filter(o => o.label.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  return <Popover.Root onOpenChange={() => setQuery("")}>
    <Popover.Trigger asChild><button type="button" aria-label={`Filtrar por ${label.toLocaleLowerCase("es")}`} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${selected.length ? "border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"}`}>{label}{selected.length > 0 && <span className="font-semibold tabular-nums">{selected.length}</span>}<ChevronDown className="h-3 w-3" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content align="start" sideOffset={8} collisionPadding={16} className="z-50 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-[var(--color-fg)] shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{label}</p><Popover.Close aria-label={`Cerrar filtro ${label}`} className="rounded p-1 hover:bg-[var(--color-bg-subtle)] focus-visible:outline-2"><X className="h-4 w-4" /></Popover.Close></div>
      {options.length > 7 && <input aria-label={`Buscar ${label.toLocaleLowerCase("es")}`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar opción…" className="mb-2 h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-2" />}
      <fieldset className="max-h-64 overflow-y-auto"><legend className="sr-only">{label}: podés elegir varias opciones</legend>{filtered.map(o => <label key={o.value} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-bg-subtle)]"><input type="checkbox" checked={selected.includes(o.value)} onChange={() => onChange(selected.includes(o.value) ? selected.filter(v => v !== o.value) : [...selected, o.value])} className="h-4 w-4 shrink-0 accent-[var(--color-accent)]" /><span className="break-words">{o.label}</span></label>)}{!filtered.length && <p className="p-2 text-sm text-[var(--color-fg-muted)]">No hay opciones que coincidan.</p>}</fieldset>
      <div className="mt-3 flex items-center justify-between gap-2"><button type="button" disabled={!selected.length} onClick={() => onChange([])} className="text-xs text-[var(--color-fg-muted)] underline underline-offset-4 disabled:opacity-40 focus-visible:outline-2">Quitar este filtro</button><Popover.Close asChild><Button size="sm" variant="primary">Listo</Button></Popover.Close></div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function InventoryFilters({ value, onChange, options, search, onClear }: { value: Filters; onChange: (v: Filters) => void; options: Record<Group, FilterOption[]>; search: string; onClear: () => void }) {
  const active = groups.flatMap(g => value[g.key].map(v => ({ key: g.key, value: v, label: `${g.label}: ${options[g.key].find(o => o.value === v)?.label || v}` })));
  const invalidRange = value.precioMin !== "" && value.precioMax !== "" && Number(value.precioMin) > Number(value.precioMax);
  return <section aria-label="Filtros del inventario" className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Filtrar productos</h2><button type="button" disabled={!active.length && !value.precioMin && !value.precioMax && !search} onClick={() => { onChange(EMPTY_INVENTORY_FILTERS); onClear(); }} className="text-xs text-[var(--color-fg-muted)] underline underline-offset-4 focus-visible:outline-2 disabled:opacity-40">Limpiar filtros</button></div>
    <div className="flex flex-wrap gap-2">{groups.map(g => <MultiFilter key={g.key} label={g.label} options={options[g.key]} selected={value[g.key]} onChange={selected => onChange({ ...value, [g.key]: selected })} />)}</div>
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 space-y-1 sm:max-w-40"><span className="block text-xs text-[var(--color-fg-muted)]">Precio desde ($)</span><input aria-label="Precio mínimo" type="number" min={0} value={value.precioMin} onChange={e => onChange({ ...value, precioMin: e.target.value })} className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-2" placeholder="Sin mínimo" /></label><label className="min-w-0 flex-1 space-y-1 sm:max-w-40"><span className="block text-xs text-[var(--color-fg-muted)]">Precio hasta ($)</span><input aria-label="Precio máximo" type="number" min={0} aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? "inventory-price-error" : undefined} value={value.precioMax} onChange={e => onChange({ ...value, precioMax: e.target.value })} className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-2" placeholder="Sin máximo" /></label><p className="w-full text-xs leading-relaxed text-[var(--color-fg-muted)] sm:w-auto sm:flex-1">Elegí varias opciones por filtro. Los filtros se combinan entre sí. Precio de venta por transferencia.</p></div>
    {invalidRange && <p id="inventory-price-error" role="alert" className="text-sm text-[var(--color-danger)]">El precio máximo debe ser igual o mayor al mínimo.</p>}
    {(active.length > 0 || value.precioMin || value.precioMax || search) && <div aria-label="Filtros activos" className="flex flex-wrap gap-2">{active.map(a => <button key={`${a.key}-${a.value}`} type="button" aria-label={`Quitar ${a.label}`} onClick={() => onChange({ ...value, [a.key]: value[a.key].filter(v => v !== a.value) })} className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-lg bg-[var(--color-bg-subtle)] px-2 py-1 text-xs text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)] focus-visible:outline-2"><span className="break-words">{a.label}</span><X className="h-3 w-3 shrink-0" /></button>)}{(value.precioMin || value.precioMax) && <button type="button" aria-label="Quitar rango de precio" onClick={() => onChange({ ...value, precioMin: "", precioMax: "" })} className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-[var(--color-bg-subtle)] px-2 py-1 text-xs">Precio: {value.precioMin || "0"} a {value.precioMax || "sin máximo"}<X className="h-3 w-3" /></button>}{search && <span className="inline-flex min-h-8 items-center rounded-lg bg-[var(--color-bg-subtle)] px-2 py-1 text-xs">Búsqueda: {search}</span>}</div>}
  </section>;
}
