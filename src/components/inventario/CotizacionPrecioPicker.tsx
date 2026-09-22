"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Search, X } from "lucide-react";
import { Cotizacion } from "@/lib/types";
import { productosCotizados, ProductoCotizado } from "@/lib/inventory-sync";
import { fmtARS } from "@/lib/utils";
import { fetcher } from "@/lib/fetcher";
import { Spinner } from "@/components/ui/Spinner";

/** Minúsculas y sin tildes, para buscar "campera" y encontrar "Campéra". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function palabras(texto: string): Set<string> {
  return new Set(normalizar(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 3));
}

const MAX_FILAS = 60;

/**
 * Lista los productos de las cotizaciones para traer su precio al ítem.
 *
 * Sin búsqueda, arriba van el producto del mismo pedido de CSSBuy (si el ítem
 * tiene oid) y después los que comparten más palabras con el nombre del ítem:
 * casi siempre el que buscás está entre los primeros.
 */
export function CotizacionPrecioPicker({
  nombreItem,
  oidItem,
  onPick,
  onClose,
}: {
  nombreItem: string;
  oidItem: string;
  onPick: (p: ProductoCotizado) => void;
  onClose: () => void;
}) {
  const [productos, setProductos] = useState<ProductoCotizado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let vivo = true;
    fetcher<{ cotizaciones: Cotizacion[] }>("/api/cotizaciones")
      .then((d) => vivo && setProductos(productosCotizados(d.cotizaciones || [])))
      .catch((e: any) => vivo && setError(e?.info?.error || e?.message || "No se pudieron leer las cotizaciones"));
    return () => {
      vivo = false;
    };
  }, []);

  const visibles = useMemo(() => {
    if (!productos) return [];
    const q = normalizar(busqueda.trim());
    if (q) {
      return productos
        .filter((p) => normalizar(`${p.nombre} ${p.cotizacionNombre}`).includes(q))
        .slice(0, MAX_FILAS);
    }
    const delItem = palabras(nombreItem);
    const puntaje = (p: ProductoCotizado) => {
      if (oidItem && p.oid === oidItem) return Infinity;
      let n = 0;
      for (const w of palabras(p.nombre)) if (delItem.has(w)) n++;
      return n;
    };
    // sort es estable: a igual puntaje se mantiene el orden por fecha.
    return [...productos].sort((a, b) => puntaje(b) - puntaje(a)).slice(0, MAX_FILAS);
  }, [productos, busqueda, nombreItem, oidItem]);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-accent)]/40 bg-[var(--color-bg-subtle)] p-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          <input
            type="text"
            autoFocus
            aria-label="Buscar producto cotizado"
            placeholder="Buscar en las cotizaciones…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full h-8 pl-7 pr-2 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="h-8 w-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!productos && !error && (
        <div className="py-6 flex justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {error && <p className="px-1 py-2 text-xs text-[var(--color-danger)]">{error}</p>}
      {productos && visibles.length === 0 && (
        <p className="px-1 py-3 text-xs text-[var(--color-fg-muted)]">
          {productos.length === 0
            ? "Todavía no hay cotizaciones guardadas con precios."
            : "Ningún producto cotizado coincide con la búsqueda."}
        </p>
      )}

      {visibles.length > 0 && (
        <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          {visibles.map((p) => (
            <li key={`${p.cotizacionId}-${p.oid || p.nombre}`}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 text-left hover:bg-[var(--color-bg-subtle)] cursor-pointer"
              >
                {p.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagen}
                    alt=""
                    className="w-8 h-8 rounded object-cover border border-[var(--color-border)] shrink-0"
                  />
                ) : (
                  <span className="w-8 h-8 rounded bg-[var(--color-bg-muted)] flex items-center justify-center shrink-0">
                    <Boxes className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs text-[var(--color-fg)]">{p.nombre}</span>
                    {oidItem && p.oid === oidItem && (
                      <span className="shrink-0 px-1.5 rounded-[var(--radius-xs)] bg-[var(--color-accent)]/15 text-[10px] font-semibold text-[var(--color-accent)]">
                        Este pedido
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--color-fg-subtle)]">
                    {p.cotizacionNombre} · {new Date(p.fecha).toLocaleDateString("es-AR")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono tnum text-xs font-semibold text-[var(--color-fg)]">
                    {p.precioARS > 0 ? fmtARS(p.precioARS) : "—"}
                  </span>
                  <span className="block font-mono tnum text-[10px] text-[var(--color-fg-subtle)]">
                    costo {fmtARS(p.costoARS)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
