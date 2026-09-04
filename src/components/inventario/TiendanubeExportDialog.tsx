"use client";

import { useMemo, useState } from "react";
import { Download, Store, AlertTriangle } from "lucide-react";
import { InventoryItem, Marca } from "@/lib/types";
import { buildTiendanubeCSV, TIENDANUBE_COLUMNS } from "@/lib/tiendanube";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Segmented } from "@/components/ui/Segmented";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

export function TiendanubeExportDialog({
  open,
  onOpenChange,
  items,
  marcas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: InventoryItem[];
  marcas: Marca[];
}) {
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [mostrarEnTienda, setMostrarEnTienda] = useState(false);
  const [redondearA, setRedondearA] = useState(0);
  const [incluirCosto, setIncluirCosto] = useState(true);

  const nombreDeMarca = useMemo(
    () => Object.fromEntries(marcas.map((m) => [m.id, m.nombre])),
    [marcas]
  );

  const resultado = useMemo(
    () =>
      buildTiendanubeCSV(items, {
        categoria,
        marca,
        nombreDeMarca,
        mostrarEnTienda,
        redondearA,
        incluirCosto,
      }),
    [items, categoria, marca, nombreDeMarca, mostrarEnTienda, redondearA, incluirCosto]
  );

  const conMarcaPropia = items.filter((i) => i.marcaId && nombreDeMarca[i.marcaId]).length;

  function descargar() {
    if (resultado.filas === 0) {
      toast.error("No hay nada para exportar", {
        description: "Ningún ítem seleccionado tiene stock disponible.",
      });
      return;
    }
    const blob = new Blob([resultado.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fecha = new Date().toISOString().slice(0, 10);
    a.download = `tiendanube-productos-${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV generado con ${resultado.filas} productos`, {
      description: mostrarEnTienda
        ? "Se van a publicar al importar."
        : "Van ocultos: subí las fotos y después publicalos.",
    });
    onOpenChange(false);
  }

  const sinStock = resultado.omitidos.filter((o) => o.motivo === "sin stock").length;
  const sinNombre = resultado.omitidos.filter((o) => o.motivo === "sin nombre").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[var(--color-accent)]" />
            Exportar a Tiendanube
          </DialogTitle>
          <DialogDescription>
            Genera el CSV de carga masiva con las {TIENDANUBE_COLUMNS.length} columnas de la
            plantilla oficial. Se importa desde Productos → Lista de productos → Importar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Categoría"
              placeholder="Ropa > Camperas"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              hint="Se aplica a todos. Subcategorías con >"
            />
            <Input
              label="Marca por defecto"
              placeholder="Opcional"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              hint={
                conMarcaPropia > 0
                  ? `${conMarcaPropia} ya tienen la suya y no se pisan`
                  : "Se aplica a todos los que no tengan marca"
              }
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase mb-1.5">
              Redondear precios
            </span>
            <Segmented
              size="sm"
              value={String(redondearA)}
              onChange={(v) => setRedondearA(Number(v))}
              options={[
                { value: "0", label: "Sin redondeo" },
                { value: "100", label: "$100" },
                { value: "500", label: "$500" },
                { value: "1000", label: "$1.000" },
              ]}
            />
          </div>

          <label className="flex items-start justify-between gap-3 p-3 rounded-[var(--radius)] bg-[var(--color-bg-subtle)] cursor-pointer">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-[var(--color-fg)]">
                Publicar al importar
              </span>
              <span className="block text-[11px] text-[var(--color-fg-muted)] mt-0.5">
                El CSV de Tiendanube no sube fotos. Si publicás ahora, los productos
                aparecen sin imagen. Conviene dejarlo apagado, cargar las fotos y
                publicar después.
              </span>
            </span>
            <Switch checked={mostrarEnTienda} onCheckedChange={setMostrarEnTienda} />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs text-[var(--color-fg)]">
              Incluir el costo unitario
              <span className="block text-[11px] text-[var(--color-fg-muted)]">
                Tiendanube lo usa para calcular tu rentabilidad
              </span>
            </span>
            <Switch checked={incluirCosto} onCheckedChange={setIncluirCosto} />
          </label>

          {/* Resumen de lo que va a salir */}
          <div className="rounded-[var(--radius)] border border-[var(--color-border)] p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--color-fg-muted)]">Productos en el CSV</span>
              <span className="font-mono tnum text-lg font-bold text-[var(--color-accent)]">
                {resultado.filas}
              </span>
            </div>
            {(sinStock > 0 || sinNombre > 0) && (
              <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-warning)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>
                  Se omiten{" "}
                  {[
                    sinStock > 0 && `${sinStock} sin stock`,
                    sinNombre > 0 && `${sinNombre} sin nombre`,
                  ]
                    .filter(Boolean)
                    .join(" y ")}
                  .
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={descargar}
            disabled={resultado.filas === 0}
          >
            Descargar CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
