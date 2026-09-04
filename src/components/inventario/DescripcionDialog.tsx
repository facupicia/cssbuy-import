"use client";

import { useMemo, useState } from "react";
import { FileText, Copy, Check, AlertTriangle } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { generarDescripcionHTML } from "@/lib/descripcion";
import { tablaDeMarca } from "@/lib/tablas-talle";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

/**
 * Ficha de un producto: cómo se va a ver en Tiendanube y su HTML.
 *
 * El HTML se puede copiar para pegarlo a mano en el editor de código de
 * Tiendanube, que es lo que hace falta cuando el producto ya existe en la
 * tienda y no se está importando por CSV.
 */
export function DescripcionDialog({
  item,
  nombreDeMarca,
  onOpenChange,
}: {
  /** null cierra el diálogo. */
  item: InventoryItem | null;
  nombreDeMarca: Record<string, string>;
  onOpenChange: (v: boolean) => void;
}) {
  const [vista, setVista] = useState<"previa" | "html">("previa");
  const [copiado, setCopiado] = useState(false);

  const marca = item?.marcaId ? nombreDeMarca[item.marcaId] : null;
  const tabla = tablaDeMarca(marca);

  const html = useMemo(() => {
    if (!item) return "";
    return generarDescripcionHTML(item, { marca, pitch: item.notas || undefined });
  }, [item, marca]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(html);
      setCopiado(true);
      toast.success("HTML copiado", {
        description: "Pegalo en Tiendanube con el botón de código fuente (<>).",
      });
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar", { description: "Copialo a mano desde la pestaña HTML." });
    }
  }

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--color-accent)]" />
            Ficha del producto
          </DialogTitle>
          <DialogDescription className="truncate">{item?.nombre}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Segmented
            size="sm"
            value={vista}
            onChange={(v) => setVista(v as "previa" | "html")}
            options={[
              { value: "previa", label: "Vista previa" },
              { value: "html", label: "Código HTML" },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            icon={copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={copiar}
          >
            {copiado ? "Copiado" : "Copiar HTML"}
          </Button>
        </div>

        {!tabla && (
          <p className="flex items-start gap-2 text-[11px] text-[var(--color-warning)] p-2.5 rounded-[var(--radius)] bg-[var(--color-warning)]/10">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              {marca
                ? `No hay tabla de talles cargada para ${marca}: la ficha sale invitando a consultar las medidas.`
                : "Este producto no tiene marca asignada, así que la ficha sale sin tabla de talles."}
            </span>
          </p>
        )}

        <div className="flex-1 overflow-y-auto mt-2">
          {vista === "previa" ? (
            // Fondo blanco fijo: así se ve en la tienda, no en el tema oscuro.
            <div
              className="rounded-[var(--radius)] border border-[var(--color-border)] bg-white p-5"
              // HTML generado por la propia app a partir de datos propios.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all text-[var(--color-fg-muted)]">
              {html}
            </pre>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border)]">
          <span className="text-[11px] text-[var(--color-fg-subtle)]">
            {html.length.toLocaleString("es-AR")} caracteres
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
