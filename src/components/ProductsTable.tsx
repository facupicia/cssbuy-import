"use client";

import { Trash2, ExternalLink, ImageIcon } from "lucide-react";
import { Product, ProductCalc } from "@/lib/types";
import { fmtUSD, fmtARS, fmtPct } from "@/lib/utils";
import { cn } from "@/lib/cn";

export interface ProductsTableProps {
  items: ProductCalc[];
  raw: Product[];
  blue: number;
  markupGlobal: number;
  onUpdate: (id: string, field: keyof Product, value: any) => void;
  onSetPrecioARS: (id: string, ars: number | undefined) => void;
  onRemove: (id: string) => void;
  onOpenPhotos: (p: ProductCalc) => void;
}

/**
 * Precio de venta manual expresado en ARS.
 * Cotizaciones viejas guardaban el override en USD: lo convertimos para poder editarlo igual.
 */
function manualARSOf(rawProd: Product | undefined, blue: number): number | undefined {
  if (!rawProd) return undefined;
  if (rawProd.precioVentaARS && rawProd.precioVentaARS > 0) return Math.round(rawProd.precioVentaARS);
  if (rawProd.precioVentaUSD && rawProd.precioVentaUSD > 0) return Math.round(rawProd.precioVentaUSD * (blue || 1));
  return undefined;
}

const numInput =
  "no-spin tnum bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-sm)] " +
  "text-xs font-mono text-[var(--color-fg)] transition-colors " +
  "focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15";

function hasPhotos(p: ProductCalc) {
  return Boolean(p.imgURL || (p.fotos_qc && p.fotos_qc.length > 0) || p.foto_peso);
}

/** Miniatura del producto. Abre el visor de fotos si hay alguna. */
function Thumb({
  p,
  size,
  onOpenPhotos,
}: {
  p: ProductCalc;
  size: "sm" | "md";
  onOpenPhotos: (p: ProductCalc) => void;
}) {
  const box = size === "sm" ? "w-9 h-9" : "w-12 h-12";

  if (!hasPhotos(p)) {
    return (
      <div
        className={cn(
          box,
          "shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-bg-muted)] border border-[var(--color-border)]",
          "flex items-center justify-center text-[var(--color-fg-subtle)]"
        )}
      >
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenPhotos(p)}
      title="Ver fotos del producto e inspección"
      className={cn(
        box,
        "relative shrink-0 rounded-[var(--radius-sm)] overflow-hidden border border-[var(--color-border)]",
        "cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      )}
    >
      <img
        src={p.imgURL || p.fotos_qc?.[0] || p.foto_peso}
        alt=""
        className="w-full h-full object-cover transition-transform group-hover:scale-110"
      />
    </button>
  );
}

/** Margen resultante del precio cargado, con su markup equivalente. */
function Margen({ p, align = "right" }: { p: ProductCalc; align?: "right" | "left" }) {
  const negativo = p.margenUnitPct < 0;
  return (
    <div className={cn("flex flex-col leading-tight", align === "right" ? "items-end" : "items-start")}>
      <span
        className={cn(
          "font-mono font-semibold tnum",
          negativo ? "text-[var(--color-danger)]" : "text-[var(--color-fg)]"
        )}
      >
        {fmtPct(p.margenUnitPct)}
      </span>
      <span className="text-[11px] text-[var(--color-fg-muted)] font-mono tnum">
        {p.markupEfectivo.toFixed(2)}x
      </span>
    </div>
  );
}

/** Ganancia total del renglón, en USD y ARS. */
function Ganancia({ p, align = "right" }: { p: ProductCalc; align?: "right" | "left" }) {
  const positiva = p.gananciaTotalUSD >= 0;
  const color = positiva ? "text-[var(--color-success)]" : "text-[var(--color-danger)]";
  const signo = positiva ? "+" : "";
  return (
    <div className={cn("flex flex-col leading-tight", align === "right" ? "items-end" : "items-start")}>
      <span className={cn("font-mono font-semibold tnum", color)}>
        {signo}
        {fmtUSD(p.gananciaTotalUSD)}
      </span>
      <span className={cn("text-[11px] font-mono tnum opacity-80", color)}>
        {signo}
        {fmtARS(p.gananciaTotalARS)}
      </span>
    </div>
  );
}

/** Campo de precio de venta en ARS. Es el control principal de toda la tabla. */
function PrecioVentaARS({
  p,
  manualARS,
  blue,
  onSetPrecioARS,
  size = "sm",
}: {
  p: ProductCalc;
  manualARS: number | undefined;
  blue: number;
  onSetPrecioARS: (id: string, ars: number | undefined) => void;
  size?: "sm" | "lg";
}) {
  const fijado = manualARS !== undefined;

  return (
    <div className={cn("flex flex-col gap-1", size === "sm" ? "items-end" : "items-stretch")}>
      <div className={cn("relative", size === "sm" ? "w-32" : "w-full")}>
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-fg-muted)] font-mono pointer-events-none">
          $
        </span>
        <input
          type="number"
          step="500"
          min="0"
          inputMode="numeric"
          placeholder={Math.round(p.precioSugeridoARS).toString()}
          value={manualARS ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onSetPrecioARS(p.id, v === "" ? undefined : parseFloat(v) || undefined);
          }}
          title={
            fijado
              ? "Precio de venta fijado a mano. Vaciá el campo para volver al sugerido."
              : "Escribí el precio de venta en ARS. Vacío = se usa el sugerido."
          }
          className={cn(
            numInput,
            "w-full text-right pl-6 font-semibold",
            size === "sm" ? "py-1.5 pr-2" : "py-2.5 pr-3 text-base",
            fijado
              ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : ""
          )}
        />
      </div>
      <span
        className={cn(
          "text-[11px] text-[var(--color-fg-muted)] font-mono tnum",
          size === "sm" ? "text-right" : "text-left"
        )}
      >
        {fmtUSD(blue > 0 ? p.ventaUnitARS / blue : 0)}
        {p.cantidad > 1 && ` · ${p.cantidad}u = ${fmtARS(p.ventaUnitARS * p.cantidad)}`}
      </span>
    </div>
  );
}

/** Precio sugerido por el markup global. Clickeable para adoptarlo. */
function Sugerido({
  p,
  markupGlobal,
  onSetPrecioARS,
  className,
  compact = false,
}: {
  p: ProductCalc;
  markupGlobal: number;
  onSetPrecioARS: (id: string, ars: number | undefined) => void;
  className?: string;
  /** Oculta la linea en USD: en mobile ya la muestra el campo de abajo. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSetPrecioARS(p.id, Math.round(p.precioSugeridoARS))}
      title={`Usar el sugerido (${markupGlobal.toFixed(1)}x) como precio de venta`}
      className={cn(
        "group flex flex-col items-end leading-tight rounded-[var(--radius-sm)] px-1.5 py-1 -mx-1.5",
        "cursor-pointer transition-colors hover:bg-[var(--color-accent)]/8",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        className
      )}
    >
      <span className="font-mono tnum text-[var(--color-fg)] group-hover:text-[var(--color-accent)] transition-colors">
        {fmtARS(p.precioSugeridoARS)}
      </span>
      {!compact && (
        <span className="text-[11px] text-[var(--color-fg-muted)] font-mono tnum">
          {fmtUSD(p.precioSugeridoUSD)}
        </span>
      )}
    </button>
  );
}

export function ProductsTable({
  items,
  raw,
  blue,
  markupGlobal,
  onUpdate,
  onSetPrecioARS,
  onRemove,
  onOpenPhotos,
}: ProductsTableProps) {
  const rawById = new Map(raw.map((r) => [r.id, r]));

  return (
    <>
      {/* ── Desktop: tabla con encabezados agrupados ───────────────────── */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {/* Fila 1: grupos. Orienta antes de leer las 11 columnas. */}
            <tr className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-fg-subtle)]">
              <th className="sticky left-0 z-20 bg-[var(--color-bg-sticky)] py-2 px-3" />
              <th
                colSpan={4}
                className="py-2 px-3 text-center bg-[var(--color-bg-sticky)] border-l border-[var(--color-border)]"
              >
                Datos del pedido
              </th>
              <th
                colSpan={2}
                className="py-2 px-3 text-center bg-[var(--color-bg-sticky)] border-l border-[var(--color-border)]"
              >
                Costo puesto acá
              </th>
              <th
                colSpan={3}
                className="py-2 px-3 text-center bg-[var(--color-accent)]/8 border-l border-[var(--color-border)] text-[var(--color-accent)]"
              >
                Precio de venta
              </th>
              <th
                colSpan={2}
                className="py-2 px-3 text-center bg-[var(--color-bg-sticky)] border-l border-[var(--color-border)]"
              >
                Resultado
              </th>
            </tr>
            {/* Fila 2: columnas */}
            <tr className="border-b border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider">
              <th className="sticky left-0 z-20 bg-[var(--color-bg-subtle)] py-2 px-3 min-w-[200px] shadow-[var(--shadow-sticky)]">
                Producto
              </th>
              <th className="py-2 px-3 text-center w-16 border-l border-[var(--color-border)]">Cant.</th>
              <th className="py-2 px-3 text-right w-24">Precio ¥</th>
              <th className="py-2 px-3 text-right w-24">Flete ¥</th>
              <th className="py-2 px-3 text-right w-24">Peso g</th>
              <th className="py-2 px-3 text-right w-28 border-l border-[var(--color-border)]">Unitario</th>
              <th className="py-2 px-3 text-right w-28">Total</th>
              <th className="py-2 px-3 text-right w-32 border-l border-[var(--color-border)]">Sugerido</th>
              <th className="py-2 px-3 text-right w-36 text-[var(--color-accent)]">Venta ARS</th>
              <th className="py-2 px-3 text-right w-24">Margen</th>
              <th className="py-2 px-3 text-right w-32 border-l border-[var(--color-border)]">Ganancia</th>
              <th className="py-2 px-3 text-center w-12" />
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--color-border)] text-xs">
            {items.map((p) => {
              const rawProd = rawById.get(p.id);
              const manualARS = manualARSOf(rawProd, blue);

              return (
                <tr key={p.id} className="group hover:bg-[var(--color-bg-hover)] transition-colors">
                  {/* Producto (columna fija) */}
                  <td className="sticky left-0 z-10 bg-[var(--color-bg-elevated)] group-hover:bg-[var(--color-bg-hover)] transition-colors py-2.5 px-3 shadow-[var(--shadow-sticky)]">
                    <div className="flex items-center gap-2.5">
                      <Thumb p={p} size="sm" onOpenPhotos={onOpenPhotos} />
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={p.nombre}
                          placeholder="Nombre del producto"
                          onChange={(e) => onUpdate(p.id, "nombre", e.target.value)}
                          className="w-full text-xs font-medium bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none py-0.5 truncate"
                        />
                        {p.link && (
                          <a
                            href={p.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {p.oid ? `#${p.oid}` : "Ver en CSSBuy"}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Datos del pedido */}
                  <td className="py-2.5 px-3 text-center border-l border-[var(--color-border)]">
                    <input
                      type="number"
                      min="1"
                      value={p.cantidad}
                      onChange={(e) => onUpdate(p.id, "cantidad", parseInt(e.target.value) || 1)}
                      className={cn(numInput, "w-12 text-center py-1.5")}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      step="0.1"
                      value={p.precioCNY}
                      onChange={(e) => onUpdate(p.id, "precioCNY", parseFloat(e.target.value) || 0)}
                      className={cn(numInput, "w-20 text-right py-1.5 px-2")}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      step="0.1"
                      value={p.envioChinaCNY}
                      onChange={(e) => onUpdate(p.id, "envioChinaCNY", parseFloat(e.target.value) || 0)}
                      className={cn(numInput, "w-20 text-right py-1.5 px-2")}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      value={p.pesoG}
                      onChange={(e) => onUpdate(p.id, "pesoG", parseInt(e.target.value) || 0)}
                      className={cn(numInput, "w-20 text-right py-1.5 px-2")}
                    />
                  </td>

                  {/* Costo */}
                  <td className="py-2.5 px-3 text-right border-l border-[var(--color-border)]">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-mono tnum text-[var(--color-fg)]">{fmtUSD(p.costoUnitUSD)}</span>
                      <span className="text-[11px] text-[var(--color-fg-muted)] font-mono tnum">
                        {fmtARS(p.costoUnitARS)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-mono tnum font-semibold text-[var(--color-fg)]">
                        {fmtUSD(p.costoTotalUSD)}
                      </span>
                      <span className="text-[11px] text-[var(--color-fg-muted)] font-mono tnum">
                        {fmtARS(p.costoTotalUSD * blue)}
                      </span>
                    </div>
                  </td>

                  {/* Precio de venta */}
                  <td className="py-2.5 px-3 text-right border-l border-[var(--color-border)]">
                    <Sugerido p={p} markupGlobal={markupGlobal} onSetPrecioARS={onSetPrecioARS} />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <PrecioVentaARS p={p} manualARS={manualARS} blue={blue} onSetPrecioARS={onSetPrecioARS} />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Margen p={p} />
                  </td>

                  {/* Resultado */}
                  <td className="py-2.5 px-3 text-right border-l border-[var(--color-border)]">
                    <Ganancia p={p} />
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      title="Quitar del paquete"
                      className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile / tablet: una tarjeta por producto ──────────────────── */}
      <div className="lg:hidden divide-y divide-[var(--color-border)]">
        {items.map((p) => {
          const rawProd = rawById.get(p.id);
          const manualARS = manualARSOf(rawProd, blue);

          return (
            <div key={p.id} className="p-4 space-y-3.5">
              {/* Cabecera */}
              <div className="flex items-start gap-3">
                <Thumb p={p} size="md" onOpenPhotos={onOpenPhotos} />
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={p.nombre}
                    placeholder="Nombre del producto"
                    onChange={(e) => onUpdate(p.id, "nombre", e.target.value)}
                    className="w-full text-sm font-medium bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none py-1"
                  />
                  {p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-[11px] text-[var(--color-fg-muted)]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {p.oid ? `#${p.oid}` : "Ver en CSSBuy"}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  title="Quitar del paquete"
                  className="p-2 -m-1 rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Datos del pedido */}
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { label: "Cant.", value: p.cantidad, field: "cantidad", step: "1", parse: (v: string) => parseInt(v) || 1 },
                    { label: "Precio ¥", value: p.precioCNY, field: "precioCNY", step: "0.1", parse: (v: string) => parseFloat(v) || 0 },
                    { label: "Flete ¥", value: p.envioChinaCNY, field: "envioChinaCNY", step: "0.1", parse: (v: string) => parseFloat(v) || 0 },
                    { label: "Peso g", value: p.pesoG, field: "pesoG", step: "1", parse: (v: string) => parseInt(v) || 0 },
                  ] as const
                ).map((f) => (
                  <label key={f.field} className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)] font-medium">
                      {f.label}
                    </span>
                    <input
                      type="number"
                      step={f.step}
                      value={f.value}
                      onChange={(e) => onUpdate(p.id, f.field, f.parse(e.target.value))}
                      className={cn(numInput, "w-full text-right py-2 px-2 text-sm")}
                    />
                  </label>
                ))}
              </div>

              {/* Costo */}
              <div className="flex items-center justify-between rounded-[var(--radius)] bg-[var(--color-bg-subtle)] px-3 py-2">
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                    Costo unitario
                  </span>
                  <span className="font-mono tnum text-sm text-[var(--color-fg)]">
                    {fmtARS(p.costoUnitARS)}{" "}
                    <span className="text-[var(--color-fg-muted)]">· {fmtUSD(p.costoUnitUSD)}</span>
                  </span>
                </div>
                {p.cantidad > 1 && (
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                      Total
                    </span>
                    <span className="font-mono tnum text-sm font-semibold">{fmtUSD(p.costoTotalUSD)}</span>
                  </div>
                )}
              </div>

              {/* Precio de venta: el control protagonista en mobile */}
              <div className="rounded-[var(--radius)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--color-accent)]">
                    Precio de venta
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--color-fg-muted)]">sugerido</span>
                    <Sugerido
                      p={p}
                      markupGlobal={markupGlobal}
                      onSetPrecioARS={onSetPrecioARS}
                      compact
                    />
                  </div>
                </div>
                <PrecioVentaARS
                  p={p}
                  manualARS={manualARS}
                  blue={blue}
                  onSetPrecioARS={onSetPrecioARS}
                  size="lg"
                />
              </div>

              {/* Resultado */}
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                    Margen
                  </span>
                  <Margen p={p} align="left" />
                </div>
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                    Ganancia
                  </span>
                  <Ganancia p={p} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
