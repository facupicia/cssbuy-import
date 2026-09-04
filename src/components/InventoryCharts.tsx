"use client";

import { useMemo } from "react";
import { InventoryItem } from "@/lib/types";
import { calcInventoryItem, ESTADO_LABEL } from "@/lib/inventory";
import { fmtARS } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/**
 * Gráficos del inventario.
 *
 * Todos son de una sola serie y un solo tono: el largo de la barra ya codifica
 * la magnitud, así que pintar cada barra de un color distinto gastaría el canal
 * de color en información repetida. El color solo aparece donde significa algo
 * (ganancia positiva vs negativa) y siempre acompañado del signo, nunca solo.
 *
 * La vista de tabla que pide la accesibilidad es la propia tabla de inventario,
 * que está en la misma página con los mismos números.
 */

const BAR_H = "h-2.5";

/** Fila de barra horizontal con etiqueta a la izquierda y valor al final. */
function BarRow({
  label,
  sub,
  value,
  valueLabel,
  max,
  tone = "accent",
  title,
}: {
  label: string;
  sub?: string;
  value: number;
  valueLabel: string;
  max: number;
  tone?: "accent" | "success" | "danger";
  title?: string;
}) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const fill = {
    accent: "bg-[var(--color-accent)]",
    success: "bg-[var(--color-success)]",
    danger: "bg-[var(--color-danger)]",
  }[tone];
  const text = {
    accent: "text-[var(--color-fg)]",
    success: "text-[var(--color-success)]",
    danger: "text-[var(--color-danger)]",
  }[tone];

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-1.5" title={title}>
      <div className="min-w-0">
        <span className="block text-xs text-[var(--color-fg)] truncate">{label}</span>
        {sub && (
          <span className="block text-[11px] text-[var(--color-fg-muted)] truncate">{sub}</span>
        )}
      </div>
      <span className={cn("text-xs font-mono tnum font-semibold self-start", text)}>
        {valueLabel}
      </span>
      {/* Pista + relleno. Extremo redondeado de 4px, anclado a la base. */}
      <div
        className={cn(
          "col-span-2 rounded-full bg-[var(--color-bg-muted)] overflow-hidden",
          BAR_H
        )}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ChartCard({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="md" className="min-w-0">
      <div className="mb-3">
        {/* El título nombra la serie: por eso ninguno lleva caja de leyenda. */}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
          {titulo}
        </h3>
        {ayuda && <p className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </Card>
  );
}

export function InventoryCharts({ items }: { items: InventoryItem[] }) {
  const datos = useMemo(() => {
    const calc = items.map(calcInventoryItem);

    // 1. Capital inmovilizado por estado
    const porEstado = new Map<string, { capital: number; unidades: number }>();
    for (const c of calc) {
      if (c.stock <= 0) continue;
      const k = c.estado;
      const acc = porEstado.get(k) ?? { capital: 0, unidades: 0 };
      acc.capital += c.capitalStockARS;
      acc.unidades += c.stock;
      porEstado.set(k, acc);
    }
    const estados = [...porEstado.entries()]
      .map(([estado, v]) => ({ estado, ...v }))
      .sort((a, b) => b.capital - a.capital);

    // 2. Los que más ganancia realizaron
    const ganadores = calc
      .filter((c) => c.cantidadVendida > 0)
      .sort((a, b) => b.gananciaRealizadaARS - a.gananciaRealizadaARS)
      .slice(0, 6);

    // 3. Rotación: cuánto se vendió de lo comprado
    const rotacion = calc
      .filter((c) => c.cantidadInicial > 0)
      .sort((a, b) => b.cantidadVendida / b.cantidadInicial - a.cantidadVendida / a.cantidadInicial)
      .slice(0, 6);

    return { estados, ganadores, rotacion };
  }, [items]);

  const { estados, ganadores, rotacion } = datos;

  // Con un solo dato una barra no compara nada: ahí el número solo ya alcanza,
  // y esos números ya están arriba en las métricas.
  const mostrarEstados = estados.length >= 2;
  const mostrarGanadores = ganadores.length >= 2;
  const mostrarRotacion = rotacion.length >= 2;

  if (!mostrarEstados && !mostrarGanadores && !mostrarRotacion) return null;

  const maxCapital = Math.max(...estados.map((e) => e.capital), 0);
  const maxGanancia = Math.max(...ganadores.map((g) => Math.abs(g.gananciaRealizadaARS)), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {mostrarEstados && (
        <ChartCard
          titulo="Dónde está tu plata"
          ayuda="Capital inmovilizado en stock sin vender, por estado"
        >
          <div className="divide-y divide-[var(--color-border)]">
            {estados.map((e) => (
              <BarRow
                key={e.estado}
                label={ESTADO_LABEL[e.estado as keyof typeof ESTADO_LABEL] ?? e.estado}
                sub={`${e.unidades} ${e.unidades === 1 ? "unidad" : "unidades"}`}
                value={e.capital}
                valueLabel={fmtARS(e.capital)}
                max={maxCapital}
                title={`${fmtARS(e.capital)} inmovilizados en ${e.unidades} unidades`}
              />
            ))}
          </div>
        </ChartCard>
      )}

      {mostrarGanadores && (
        <ChartCard
          titulo="Los que más te dejaron"
          ayuda="Ganancia ya embolsada por las unidades vendidas"
        >
          <div className="divide-y divide-[var(--color-border)]">
            {ganadores.map((g) => {
              const positiva = g.gananciaRealizadaARS >= 0;
              return (
                <BarRow
                  key={g.id}
                  label={g.nombre || "Sin nombre"}
                  sub={`${g.cantidadVendida} ${g.cantidadVendida === 1 ? "vendida" : "vendidas"}`}
                  value={g.gananciaRealizadaARS}
                  valueLabel={`${positiva ? "+" : "−"}${fmtARS(Math.abs(g.gananciaRealizadaARS))}`}
                  max={maxGanancia}
                  tone={positiva ? "success" : "danger"}
                  title={`${g.nombre}: ${fmtARS(g.gananciaRealizadaARS)} en ${g.cantidadVendida} unidades`}
                />
              );
            })}
          </div>
        </ChartCard>
      )}

      {mostrarRotacion && (
        <ChartCard titulo="Qué tan rápido sale" ayuda="Unidades vendidas sobre las compradas">
          <div className="divide-y divide-[var(--color-border)]">
            {rotacion.map((r) => {
              const pct = r.cantidadInicial > 0 ? r.cantidadVendida / r.cantidadInicial : 0;
              return (
                <BarRow
                  key={r.id}
                  label={r.nombre || "Sin nombre"}
                  sub={`${r.cantidadVendida} de ${r.cantidadInicial} · quedan ${r.stock}`}
                  value={r.cantidadVendida}
                  valueLabel={`${Math.round(pct * 100)}%`}
                  max={r.cantidadInicial}
                  title={`${r.nombre}: vendidas ${r.cantidadVendida} de ${r.cantidadInicial}`}
                />
              );
            })}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
