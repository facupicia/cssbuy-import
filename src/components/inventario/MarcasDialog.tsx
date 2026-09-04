"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag, Plus, Trash2, Check, Sparkles, Pencil, X } from "lucide-react";
import { InventoryItem, Marca } from "@/lib/types";
import { sugerirItems } from "@/lib/marcas-match";
import { fetcher, fetcherPost, fetcherPatch, fetcherDelete } from "@/lib/fetcher";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

export type MarcaConUso = Marca & { items: number };

export function MarcasDialog({
  open,
  onOpenChange,
  items,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Inventario actual, para poder sugerir asignaciones por nombre. */
  items: InventoryItem[];
  onChanged: () => void;
}) {
  const [marcas, setMarcas] = useState<MarcaConUso[]>([]);
  const [cargando, setCargando] = useState(false);
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [asignando, setAsignando] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const d = await fetcher<{ marcas: MarcaConUso[] }>("/api/marcas");
      setMarcas(d.marcas || []);
    } catch (e: any) {
      toast.error("No se pudieron cargar las marcas", {
        description: e?.info?.error || e?.message,
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (open) cargar();
  }, [open]);

  /** Para cada marca, los productos sin marca cuyo nombre la menciona. */
  const sugerencias = useMemo(() => {
    const out: Record<string, ReturnType<typeof sugerirItems>> = {};
    for (const m of marcas) out[m.id] = sugerirItems(m, items);
    return out;
  }, [marcas, items]);

  async function crear() {
    const nombre = nueva.trim();
    if (!nombre) return;
    setGuardando(true);
    try {
      await fetcherPost("/api/marcas", { nombre });
      setNueva("");
      await cargar();
      onChanged();
    } catch (e: any) {
      toast.error("No se pudo crear", { description: e?.info?.error || e?.message });
    } finally {
      setGuardando(false);
    }
  }

  async function renombrar(id: string) {
    const nombre = nombreEdit.trim();
    if (!nombre) return;
    try {
      await fetcherPatch(`/api/marcas/${id}`, { nombre });
      setEditandoId(null);
      await cargar();
      onChanged();
    } catch (e: any) {
      toast.error("No se pudo renombrar", { description: e?.info?.error || e?.message });
    }
  }

  async function borrar(m: MarcaConUso) {
    try {
      await fetcherDelete(`/api/marcas/${m.id}`);
      toast.success(`Marca "${m.nombre}" eliminada`, {
        description:
          m.items > 0
            ? `${m.items} ${m.items === 1 ? "producto queda" : "productos quedan"} sin marca. No se borró ninguno.`
            : undefined,
      });
      await cargar();
      onChanged();
    } catch (e: any) {
      toast.error("No se pudo eliminar", { description: e?.info?.error || e?.message });
    }
  }

  async function asignarSugeridos(m: MarcaConUso) {
    const ids = (sugerencias[m.id] ?? []).map((s) => s.itemId);
    if (ids.length === 0) return;
    setAsignando(m.id);
    try {
      const res = await fetcherPatch<{ count: number }>("/api/inventario/bulk", {
        ids,
        patch: { marcaId: m.id },
      });
      toast.success(`${res.count} ${res.count === 1 ? "producto asignado" : "productos asignados"} a ${m.nombre}`);
      await cargar();
      onChanged();
    } catch (e: any) {
      toast.error("No se pudo asignar", { description: e?.info?.error || e?.message });
    } finally {
      setAsignando(null);
    }
  }

  const sinMarca = items.filter((i) => !i.marcaId).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--color-accent)]" />
            Marcas
          </DialogTitle>
          <DialogDescription>
            Cargá tus marcas y asignalas a los productos para poder filtrar. También se usan
            en la columna Marca del CSV de Tiendanube.
          </DialogDescription>
        </DialogHeader>

        {/* Alta */}
        <div className="flex items-end gap-2">
          <Input
            label="Nueva marca"
            placeholder="Amiri, Vale, EM…"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                crear();
              }
            }}
          />
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={crear}
            loading={guardando}
            disabled={!nueva.trim()}
          >
            Agregar
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 mt-3 space-y-2">
          {cargando && (
            <div className="py-10 flex justify-center">
              <Spinner className="h-7 w-7" />
            </div>
          )}

          {!cargando && marcas.length === 0 && (
            <p className="text-xs text-[var(--color-fg-muted)] p-3 rounded-[var(--radius)] bg-[var(--color-bg-subtle)]">
              Todavía no cargaste ninguna marca. Agregá la primera arriba y, si el nombre
              aparece en los títulos de tus productos, te va a ofrecer asignarlos en lote.
            </p>
          )}

          {marcas.map((m) => {
            const sug = sugerencias[m.id] ?? [];
            const editando = editandoId === m.id;

            return (
              <div
                key={m.id}
                className="rounded-[var(--radius)] border border-[var(--color-border)] p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  {editando ? (
                    <>
                      <input
                        autoFocus
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renombrar(m.id);
                          if (e.key === "Escape") setEditandoId(null);
                        }}
                        className="flex-1 h-8 px-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-accent)] rounded-[var(--radius-sm)] focus:outline-none"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Check className="h-3.5 w-3.5" />}
                        onClick={() => renombrar(m.id)}
                        aria-label="Guardar nombre"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={() => setEditandoId(null)}
                        aria-label="Cancelar"
                      />
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 text-sm font-medium text-[var(--color-fg)] truncate">
                        {m.nombre}
                      </span>
                      <span className="text-[11px] font-mono tnum text-[var(--color-fg-muted)] shrink-0">
                        {m.items} {m.items === 1 ? "producto" : "productos"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-1.5"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setEditandoId(m.id);
                          setNombreEdit(m.nombre);
                        }}
                        title="Renombrar"
                        aria-label={`Renombrar ${m.nombre}`}
                      />
                      <button
                        onClick={() => borrar(m)}
                        title="Eliminar marca"
                        aria-label={`Eliminar ${m.nombre}`}
                        className="px-1.5 py-1 text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {sug.length > 0 && (
                  <div className="rounded-[var(--radius-sm)] bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/25 p-2.5 space-y-2">
                    <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-fg)]">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 mt-px text-[var(--color-accent)]" />
                      <span>
                        {sug.length} {sug.length === 1 ? "producto sin marca menciona" : "productos sin marca mencionan"}{" "}
                        <strong>{m.nombre}</strong> en el título.
                      </span>
                    </p>
                    <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                      {sug.slice(0, 6).map((s) => (
                        <li key={s.itemId} className="text-[11px] text-[var(--color-fg-muted)] truncate">
                          <span className="font-mono text-[var(--color-accent)]">{s.coincidencia}</span>
                          {" · "}
                          {s.nombre}
                        </li>
                      ))}
                      {sug.length > 6 && (
                        <li className="text-[11px] text-[var(--color-fg-subtle)]">
                          …y {sug.length - 6} más
                        </li>
                      )}
                    </ul>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Check className="h-3.5 w-3.5" />}
                      loading={asignando === m.id}
                      onClick={() => asignarSugeridos(m)}
                    >
                      Asignar los {sug.length}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {!cargando && marcas.length > 0 && (
            <p className="text-[11px] text-[var(--color-fg-subtle)] pt-1">
              {sinMarca} {sinMarca === 1 ? "producto sigue" : "productos siguen"} sin marca.
              Podés asignarlos de a uno editándolos, o varios a la vez seleccionándolos en la
              lista y usando Editar.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end pt-3 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
