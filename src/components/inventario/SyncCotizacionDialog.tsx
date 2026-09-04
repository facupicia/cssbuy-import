"use client";

import { useEffect, useState } from "react";
import { FileText, ArrowRight, Check, AlertTriangle } from "lucide-react";
import { SyncPlan, PriceDiff } from "@/lib/inventory-sync";
import { fmtARS } from "@/lib/utils";
import { fetcher, fetcherPost } from "@/lib/fetcher";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

type Respuesta = SyncPlan & { cambian: number; cotizaciones: number };

/** Antes → después de un número, con el signo del cambio. */
function Delta({ antes, despues }: { antes: number; despues: number }) {
  const sube = despues > antes;
  return (
    <span className="font-mono tnum text-[11px] whitespace-nowrap">
      <span className="text-[var(--color-fg-subtle)] line-through">{fmtARS(antes)}</span>
      <ArrowRight className="inline h-3 w-3 mx-1 text-[var(--color-fg-subtle)]" />
      <span className={sube ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-warning)] font-semibold"}>
        {fmtARS(despues)}
      </span>
    </span>
  );
}

export function SyncCotizacionDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [plan, setPlan] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCargando(true);
    setError(null);
    fetcher<Respuesta>("/api/inventario/desde-cotizacion")
      .then(setPlan)
      .catch((e: any) => setError(e?.info?.error || e?.message || "No se pudo calcular"))
      .finally(() => setCargando(false));
  }, [open]);

  const cambian: PriceDiff[] = plan?.diffs.filter((d) => d.cambia) ?? [];
  const alDia = (plan?.diffs.length ?? 0) - cambian.length;

  async function aplicar() {
    setAplicando(true);
    try {
      const res = await fetcherPost<{ actualizados: number }>(
        "/api/inventario/desde-cotizacion",
        {}
      );
      toast.success(
        res.actualizados > 0
          ? `${res.actualizados} ${res.actualizados === 1 ? "ítem actualizado" : "ítems actualizados"}`
          : "Ya estaba todo al día"
      );
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error("No se pudo aplicar", { description: e?.info?.error || e?.message });
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--color-accent)]" />
            Traer precios de las cotizaciones
          </DialogTitle>
          <DialogDescription>
            Copia el precio de venta y el costo landed que calculaste en la cotización a los
            ítems del inventario, emparejando por el número de orden de CSSBuy. Si un producto
            está en varias cotizaciones, gana la más reciente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {cargando && (
            <div className="py-12 flex justify-center">
              <Spinner className="h-7 w-7" />
            </div>
          )}

          {error && (
            <p className="text-xs text-[var(--color-danger)] p-3 rounded-[var(--radius)] bg-[var(--color-danger)]/10">
              {error}
            </p>
          )}

          {plan && !cargando && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-[var(--color-fg-muted)]">
                  <span className="font-mono tnum font-bold text-[var(--color-accent)] text-base">
                    {cambian.length}
                  </span>{" "}
                  {cambian.length === 1 ? "ítem cambia" : "ítems cambian"}
                </span>
                {alDia > 0 && (
                  <span className="text-[var(--color-fg-muted)]">{alDia} ya al día</span>
                )}
                {plan.sinMatch.length > 0 && (
                  <span className="text-[var(--color-fg-muted)]">
                    {plan.sinMatch.length} sin cotización
                  </span>
                )}
              </div>

              {cambian.length > 0 && (
                <div className="border border-[var(--color-border)] rounded-[var(--radius)] overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[11px] uppercase text-[var(--color-fg-muted)]">
                      <tr>
                        <th className="py-2 px-3">Producto</th>
                        <th className="py-2 px-3">Precio de venta</th>
                        <th className="py-2 px-3">Costo unitario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {cambian.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2 px-3 min-w-0">
                            <span className="block truncate max-w-[220px] text-[var(--color-fg)]">
                              {d.nombre}
                            </span>
                            <span className="block text-[11px] text-[var(--color-fg-subtle)] truncate">
                              {d.cotizacionNombre}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <Delta antes={d.precioAntes} despues={d.precioDespues} />
                          </td>
                          <td className="py-2 px-3">
                            <Delta antes={d.costoAntes} despues={d.costoDespues} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {cambian.length === 0 && plan.diffs.length > 0 && (
                <p className="text-xs text-[var(--color-fg-muted)] p-3 rounded-[var(--radius)] bg-[var(--color-bg-subtle)]">
                  El inventario ya coincide con las cotizaciones. No hay nada que traer.
                </p>
              )}

              {plan.diffs.length === 0 && (
                <p className="flex items-start gap-2 text-xs text-[var(--color-warning)] p-3 rounded-[var(--radius)] bg-[var(--color-warning)]/10">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                  <span>
                    Ningún ítem del inventario matchea con una cotización. El vínculo es el
                    número de orden de CSSBuy: los ítems cargados a mano no lo tienen.
                  </span>
                </p>
              )}

              {plan.sinMatch.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                    Ver los {plan.sinMatch.length} sin cotización
                  </summary>
                  <ul className="mt-2 space-y-1 pl-1">
                    {plan.sinMatch.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-[var(--color-fg-muted)]">{m.nombre}</span>
                        <span className="text-[11px] text-[var(--color-fg-subtle)] shrink-0">
                          {m.motivo}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={aplicando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<Check className="h-3.5 w-3.5" />}
            onClick={aplicar}
            loading={aplicando}
            disabled={cambian.length === 0}
          >
            Aplicar a {cambian.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
