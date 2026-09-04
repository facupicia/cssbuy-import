"use client";

import { useMemo, useState } from "react";
import { Layers, Check } from "lucide-react";
import { InventoryItem, InventoryEstado, Marca } from "@/lib/types";
import { calcInventoryItem, ESTADO_LABEL, type BulkPriceOp } from "@/lib/inventory";
import { fmtARS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";

type ModoPrecio = "sin_cambio" | "porcentaje" | "markup" | "fijo";

export interface BulkChanges {
  patch: Partial<Pick<InventoryItem, "estado" | "ubicacion" | "marcaId">>;
  precio?: BulkPriceOp;
}

export function BulkEditDialog({
  open,
  onOpenChange,
  items,
  marcas,
  saving,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Ítems seleccionados, para poder previsualizar el efecto. */
  items: InventoryItem[];
  marcas: Marca[];
  saving: boolean;
  onApply: (cambios: BulkChanges) => void;
}) {
  const [estado, setEstado] = useState<InventoryEstado | "sin_cambio">("sin_cambio");
  const [ubicacion, setUbicacion] = useState("");
  const [cambiarUbicacion, setCambiarUbicacion] = useState(false);
  const [marcaId, setMarcaId] = useState<string>("sin_cambio");
  const [modoPrecio, setModoPrecio] = useState<ModoPrecio>("sin_cambio");
  const [valorPrecio, setValorPrecio] = useState<number>(0);

  /**
   * Previsualiza el precio nuevo con la misma fórmula que aplica el servidor,
   * para que no haya sorpresas al confirmar.
   */
  const preview = useMemo(() => {
    if (modoPrecio === "sin_cambio") return null;
    return items.slice(0, 3).map((it) => {
      const c = calcInventoryItem(it);
      let nuevo = c.precioVentaARS;
      if (modoPrecio === "porcentaje") {
        nuevo = Math.max(0, Math.round(c.precioVentaARS * (1 + valorPrecio / 100)));
      } else if (modoPrecio === "markup") {
        nuevo = Math.round(c.costoUnitARS * valorPrecio);
      } else {
        nuevo = Math.max(0, Math.round(valorPrecio));
      }
      return { nombre: it.nombre, antes: c.precioVentaARS, despues: nuevo };
    });
  }, [items, modoPrecio, valorPrecio]);

  const hayCambios =
    estado !== "sin_cambio" ||
    marcaId !== "sin_cambio" ||
    cambiarUbicacion ||
    (modoPrecio !== "sin_cambio" && valorPrecio !== 0);

  function aplicar() {
    const patch: BulkChanges["patch"] = {};
    if (estado !== "sin_cambio") patch.estado = estado;
    if (cambiarUbicacion) patch.ubicacion = ubicacion.trim() || null;
    if (marcaId !== "sin_cambio") patch.marcaId = marcaId === "ninguna" ? null : marcaId;

    const precio: BulkPriceOp | undefined =
      modoPrecio === "sin_cambio" ? undefined : { modo: modoPrecio, valor: valorPrecio };

    onApply({ patch, precio });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--color-accent)]" />
            Editar {items.length} {items.length === 1 ? "ítem" : "ítems"}
          </DialogTitle>
          <DialogDescription>
            Solo se cambian los campos que toques. El resto queda como está.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          {/* Estado */}
          <div>
            <span className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase mb-1.5">
              Estado
            </span>
            <Segmented
              size="sm"
              value={estado}
              onChange={(v) => setEstado(v as InventoryEstado | "sin_cambio")}
              options={[
                { value: "sin_cambio", label: "Sin cambio" },
                { value: "en_transito", label: ESTADO_LABEL.en_transito },
                { value: "en_deposito", label: ESTADO_LABEL.en_deposito },
                { value: "agotado", label: ESTADO_LABEL.agotado },
              ]}
            />
          </div>

          {/* Marca */}
          {marcas.length > 0 && (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase mb-1.5">
                Marca
              </span>
              <select
                value={marcaId}
                onChange={(e) => setMarcaId(e.target.value)}
                className="w-full h-9 px-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius)] text-[var(--color-fg)] cursor-pointer focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="sin_cambio">Sin cambio</option>
                <option value="ninguna">Quitar la marca</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Ubicación */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cambiarUbicacion}
                onChange={(e) => setCambiarUbicacion(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
                Cambiar ubicación
              </span>
            </label>
            {cambiarUbicacion && (
              <Input
                placeholder="Ej: Estante A · Caja 3 (vacío = borrar)"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
              />
            )}
          </div>

          {/* Precio */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
              Precio de venta
            </span>
            <Segmented
              size="sm"
              value={modoPrecio}
              onChange={(v) => setModoPrecio(v as ModoPrecio)}
              options={[
                { value: "sin_cambio", label: "Sin cambio" },
                { value: "porcentaje", label: "Ajustar %" },
                { value: "markup", label: "Markup" },
                { value: "fijo", label: "Fijo" },
              ]}
            />

            {modoPrecio !== "sin_cambio" && (
              <Input
                type="number"
                step={modoPrecio === "markup" ? "0.1" : modoPrecio === "porcentaje" ? "1" : "500"}
                value={valorPrecio || ""}
                onChange={(e) => setValorPrecio(parseFloat(e.target.value) || 0)}
                placeholder={
                  modoPrecio === "porcentaje" ? "10 sube, -10 baja" : modoPrecio === "markup" ? "2.5" : "150000"
                }
                suffix={modoPrecio === "porcentaje" ? "%" : modoPrecio === "markup" ? "x" : undefined}
                prefix={modoPrecio === "fijo" ? "$" : undefined}
                hint={
                  modoPrecio === "porcentaje"
                    ? "Sobre el precio actual de cada ítem"
                    : modoPrecio === "markup"
                      ? "Precio = costo unitario × este factor"
                      : "El mismo precio para todos"
                }
              />
            )}

            {preview && preview.length > 0 && valorPrecio !== 0 && (
              <div className="rounded-[var(--radius)] bg-[var(--color-bg-subtle)] p-2.5 space-y-1">
                <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Cómo queda
                </span>
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-[var(--color-fg-muted)]">{p.nombre}</span>
                    <span className="font-mono tnum shrink-0">
                      <span className="text-[var(--color-fg-subtle)] line-through">
                        {fmtARS(p.antes)}
                      </span>{" "}
                      <span className="text-[var(--color-accent)] font-semibold">
                        {fmtARS(p.despues)}
                      </span>
                    </span>
                  </div>
                ))}
                {items.length > 3 && (
                  <span className="block text-[11px] text-[var(--color-fg-subtle)]">
                    …y {items.length - 3} más
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<Check className="h-3.5 w-3.5" />}
            onClick={aplicar}
            loading={saving}
            disabled={!hayCambios}
          >
            Aplicar a {items.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
