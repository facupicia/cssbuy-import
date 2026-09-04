"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Boxes,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Pencil,
  ShoppingCart,
  DownloadCloud,
  ExternalLink,
  PackageX,
  Wallet2,
  TrendingUp,
  Layers,
  Store,
  X,
} from "lucide-react";
import {
  InventoryItem,
  InventoryEstado,
  InventoryOrigen,
  CssbuyOrder,
} from "@/lib/types";
import {
  calcInventoryItem,
  summarizeInventory,
  suggestEstado,
  ESTADO_LABEL,
} from "@/lib/inventory";
import { fmtARS, fmtUSD, fmtPct } from "@/lib/utils";
import { fetchLiveFx } from "@/lib/fx";
import { fetcher, fetcherPost, fetcherPatch, fetcherDelete } from "@/lib/fetcher";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Segmented } from "@/components/ui/Segmented";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { InventoryCharts } from "@/components/InventoryCharts";
import { TiendanubeExportDialog } from "@/components/inventario/TiendanubeExportDialog";
import { BulkEditDialog, type BulkChanges } from "@/components/inventario/BulkEditDialog";

/* ── Formulario de ítem ──────────────────────────────────────────────── */

interface FormState {
  nombre: string;
  variante: string;
  sku: string;
  link: string;
  imagen: string;
  cantidadInicial: number;
  cantidadVendida: number;
  costoUnitARS: number;
  costoUnitUSD: number;
  precioVentaARS: number;
  estado: InventoryEstado;
  ubicacion: string;
  notas: string;
}

const EMPTY_FORM: FormState = {
  nombre: "",
  variante: "",
  sku: "",
  link: "",
  imagen: "",
  cantidadInicial: 1,
  cantidadVendida: 0,
  costoUnitARS: 0,
  costoUnitUSD: 0,
  precioVentaARS: 0,
  estado: "en_deposito",
  ubicacion: "",
  notas: "",
};

function itemToForm(it: InventoryItem): FormState {
  return {
    nombre: it.nombre ?? "",
    variante: it.variante ?? "",
    sku: it.sku ?? "",
    link: it.link ?? "",
    imagen: it.imagen ?? "",
    cantidadInicial: it.cantidadInicial ?? 0,
    cantidadVendida: it.cantidadVendida ?? 0,
    costoUnitARS: it.costoUnitARS ?? 0,
    costoUnitUSD: it.costoUnitUSD ?? 0,
    precioVentaARS: it.precioVentaARS ?? 0,
    estado: it.estado ?? "en_deposito",
    ubicacion: it.ubicacion ?? "",
    notas: it.notas ?? "",
  };
}

const ESTADO_VARIANT: Record<InventoryEstado, "success" | "info" | "danger"> = {
  en_deposito: "success",
  en_transito: "info",
  agotado: "danger",
};

const ORIGEN_LABEL: Record<InventoryOrigen, string> = {
  manual: "Manual",
  cssbuy: "CSSBuy",
  cotizacion: "Cotización",
};

type OrdenInventario = "reciente" | "ganancia" | "margen" | "capital" | "stock" | "nombre";

/* ── Página ──────────────────────────────────────────────────────────── */

export default function InventarioPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<InventoryEstado | "todos">("todos");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [ventaFor, setVentaFor] = useState<InventoryItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  // Selección múltiple para las acciones en lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [orden, setOrden] = useState<OrdenInventario>("reciente");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetcher<{ items: InventoryItem[] }>("/api/inventario");
      setItems(data.items || []);
    } catch (err: any) {
      setError(err?.info?.error || err?.message || "No se pudo cargar el inventario");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summarizeInventory(items), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => (estadoFilter === "todos" ? true : it.estado === estadoFilter))
      .filter((it) => {
        if (!q) return true;
        return (
          it.nombre.toLowerCase().includes(q) ||
          (it.sku || "").toLowerCase().includes(q) ||
          (it.variante || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ca = calcInventoryItem(a);
        const cb = calcInventoryItem(b);
        switch (orden) {
          case "ganancia":
            return cb.gananciaRealizadaARS - ca.gananciaRealizadaARS;
          case "margen":
            return cb.margenUnitPct - ca.margenUnitPct;
          case "capital":
            return cb.capitalStockARS - ca.capitalStockARS;
          case "stock":
            return cb.stock - ca.stock;
          case "nombre":
            return a.nombre.localeCompare(b.nombre, "es");
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [items, search, estadoFilter, orden]);

  // La selección solo tiene sentido sobre lo que se está viendo: si cambia el
  // filtro, se descartan los ids que ya no están en pantalla.
  const visibleIds = useMemo(() => new Set(filtered.map((it) => it.id)), [filtered]);
  const selectedVisibles = useMemo(
    () => filtered.filter((it) => selected.has(it.id)),
    [filtered, selected]
  );
  const todosSeleccionados = filtered.length > 0 && selectedVisibles.length === filtered.length;

  function toggleUno(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    setSelected((prev) => {
      if (todosSeleccionados) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  function limpiarSeleccion() {
    setSelected(new Set());
  }

  async function aplicarBulk(cambios: BulkChanges) {
    const ids = selectedVisibles.map((it) => it.id);
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await fetcherPatch<{ items: InventoryItem[]; count: number }>(
        "/api/inventario/bulk",
        { ids, patch: cambios.patch, precio: cambios.precio }
      );
      toast.success(`${res.count} ${res.count === 1 ? "ítem actualizado" : "ítems actualizados"}`);
      setBulkOpen(false);
      limpiarSeleccion();
      await load();
    } catch (err: any) {
      toast.error("No se pudo aplicar el cambio", {
        description: err?.info?.error || err?.message,
      });
    } finally {
      setBulkSaving(false);
    }
  }

  async function borrarBulk() {
    const ids = selectedVisibles.map((it) => it.id);
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await fetcherPost<{ deleted: number }>("/api/inventario/bulk", {
        action: "delete",
        ids,
      });
      toast.success(`${res.deleted} ${res.deleted === 1 ? "ítem eliminado" : "ítems eliminados"}`);
      setConfirmBulkDelete(false);
      limpiarSeleccion();
      await load();
    } catch (err: any) {
      toast.error("No se pudieron eliminar", {
        description: err?.info?.error || err?.message,
      });
    } finally {
      setBulkSaving(false);
    }
  }

  /* ── Acciones ─────────────────────────────────────────────────────── */

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(it: InventoryItem) {
    setEditing(it);
    setForm(itemToForm(it));
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (form.cantidadVendida > form.cantidadInicial) {
      toast.error("Las unidades vendidas no pueden superar a las compradas");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nombre: form.nombre.trim(),
        estado:
          form.estado ??
          suggestEstado(form.cantidadInicial, form.cantidadVendida),
      };
      if (editing) {
        await fetcherPatch(`/api/inventario/${editing.id}`, payload);
        toast.success("Ítem actualizado");
      } else {
        await fetcherPost("/api/inventario", { ...payload, origen: "manual" });
        toast.success("Ítem agregado al inventario");
      }
      setFormOpen(false);
      await load();
    } catch (err: any) {
      toast.error("No se pudo guardar", {
        description: err?.info?.error || err?.message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function registrarVenta(it: InventoryItem, unidades: number, precioUnit: number) {
    const calc = calcInventoryItem(it);
    if (unidades <= 0 || unidades > calc.stock) {
      toast.error(`Solo hay ${calc.stock} unidades disponibles`);
      return;
    }
    const nuevaVendida = it.cantidadVendida + unidades;
    const patch: Record<string, unknown> = {
      cantidadVendida: nuevaVendida,
      precioVentaARS: precioUnit,
    };
    if (nuevaVendida >= it.cantidadInicial) patch.estado = "agotado";
    try {
      await fetcherPatch(`/api/inventario/${it.id}`, patch);
      toast.success(
        `Venta registrada: ${unidades} u. de "${it.nombre}"`,
        { description: `Ingreso ${fmtARS(precioUnit * unidades)}` }
      );
      setVentaFor(null);
      await load();
    } catch (err: any) {
      toast.error("No se pudo registrar la venta", {
        description: err?.info?.error || err?.message,
      });
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await fetcherDelete(`/api/inventario/${confirmDeleteId}`);
      toast.success("Ítem eliminado");
      setConfirmDeleteId(null);
      await load();
    } catch (err: any) {
      toast.error("No se pudo eliminar", {
        description: err?.info?.error || err?.message,
      });
    } finally {
      setDeleting(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-fg)]">
              Inventario
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-fg-muted)] mt-0.5">
              Stock físico en mano, costo landed unitario, unidades vendidas y ganancia realizada.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<DownloadCloud className="h-3.5 w-3.5" />}
              onClick={() => setImportOpen(true)}
            >
              Importar de CSSBuy
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Store className="h-3.5 w-3.5" />}
              onClick={() => setExportOpen(true)}
              disabled={items.length === 0}
              title="Generar el CSV de carga masiva de Tiendanube"
            >
              A Tiendanube
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={openNew}
            >
              Nuevo ítem
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={load}
              title="Refrescar"
            />
          </div>
        </div>

        {/* Error de base */}
        {error && (
          <Card padding="sm" className="border-[var(--color-danger)]/30">
            <p className="text-xs text-[var(--color-danger)]">{error}</p>
          </Card>
        )}

        {/* Métricas */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card padding="sm">
              <StatTile
                label="Unidades en stock"
                value={String(summary.unidadesStock)}
                sub={`${summary.totalItems} ítems · ${summary.unidadesVendidas} vendidas`}
                icon={<Layers className="h-3.5 w-3.5" />}
              />
            </Card>
            <Card padding="sm">
              <StatTile
                label="Capital inmovilizado"
                value={fmtARS(summary.capitalStockARS)}
                sub={`Invertido total ${fmtARS(summary.invertidoTotalARS)}`}
                icon={<Wallet2 className="h-3.5 w-3.5" />}
                tone="accent"
              />
            </Card>
            <Card padding="sm">
              <StatTile
                label="Ganancia realizada"
                value={fmtARS(summary.gananciaRealizadaARS)}
                sub={`Ingreso vendido ${fmtARS(summary.ingresoRealizadoARS)}`}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                tone={summary.gananciaRealizadaARS >= 0 ? "success" : "danger"}
              />
            </Card>
            <Card padding="sm">
              <StatTile
                label="Ganancia potencial"
                value={fmtARS(summary.gananciaPotencialARS)}
                sub="Si se vende todo el stock restante"
                icon={<Boxes className="h-3.5 w-3.5" />}
              />
            </Card>
          </div>
        )}

        {/* Gráficos */}
        {items.length > 0 && <InventoryCharts items={items} />}

        {/* Toolbar */}
        {items.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              <input
                type="text"
                placeholder="Buscar por nombre, SKU o variante..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius)] focus:outline-none focus:border-[var(--color-border-focus)]"
              />
            </div>
            <Segmented
              size="sm"
              value={estadoFilter}
              onChange={(v) => setEstadoFilter(v as InventoryEstado | "todos")}
              options={[
                { value: "todos", label: "Todos" },
                { value: "en_deposito", label: "En depósito" },
                { value: "en_transito", label: "En tránsito" },
                { value: "agotado", label: "Agotado" },
              ]}
            />
            <label className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                Ordenar
              </span>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as OrdenInventario)}
                aria-label="Ordenar el inventario"
                className="h-9 px-2 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius)] text-[var(--color-fg)] cursor-pointer focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="reciente">Más reciente</option>
                <option value="ganancia">Ganancia realizada</option>
                <option value="margen">Margen</option>
                <option value="capital">Capital inmovilizado</option>
                <option value="stock">Stock</option>
                <option value="nombre">Nombre</option>
              </select>
            </label>
          </div>
        )}

        {/* Acciones sobre la selección */}
        {selectedVisibles.length > 0 && (
          <div className="sticky top-16 sm:top-20 z-30 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/8 backdrop-blur-md px-3 py-2.5">
            <span className="text-xs font-semibold text-[var(--color-accent)]">
              {selectedVisibles.length} {selectedVisibles.length === 1 ? "seleccionado" : "seleccionados"}
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => setBulkOpen(true)}
            >
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Store className="h-3.5 w-3.5" />}
              onClick={() => setExportOpen(true)}
            >
              A Tiendanube
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              className="text-[var(--color-danger)]"
              onClick={() => setConfirmBulkDelete(true)}
            >
              Eliminar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="h-4 w-4" />}
              onClick={limpiarSeleccion}
              title="Limpiar selección"
              aria-label="Limpiar selección"
            />
          </div>
        )}

        {/* Contenido */}
        {loading ? (
          <div className="p-12 flex justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-6 w-6" />}
            title={error ? "No se pudo leer el inventario" : "Inventario vacío"}
            description={
              error
                ? "Revisá la conexión a Postgres y volvé a intentar."
                : "Cargá ítems a mano o importalos desde tus órdenes de CSSBuy sincronizadas."
            }
            action={
              !error && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<DownloadCloud className="h-3.5 w-3.5" />}
                    onClick={() => setImportOpen(true)}
                  >
                    Importar de CSSBuy
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={openNew}
                  >
                    Nuevo ítem
                  </Button>
                </div>
              )
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<PackageX className="h-6 w-6" />}
            title="Sin resultados"
            description="Ningún ítem coincide con el filtro o la búsqueda."
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            {/* Desktop: tabla. En mobile, abajo, una tarjeta por item. */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[var(--color-fg-muted)] uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 pl-3 pr-0 w-9">
                      <input
                        type="checkbox"
                        checked={todosSeleccionados}
                        onChange={toggleTodos}
                        aria-label="Seleccionar todos los ítems visibles"
                        className="accent-[var(--color-accent)] cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3">Producto</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                    <th className="py-2.5 px-3 text-right">Vendidas</th>
                    <th className="py-2.5 px-3 text-right">Costo unit.</th>
                    <th className="py-2.5 px-3 text-right">Precio venta</th>
                    <th className="py-2.5 px-3 text-right">Margen</th>
                    <th className="py-2.5 px-3 text-right">Gan. realizada</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filtered.map((it) => {
                    const c = calcInventoryItem(it);
                    return (
                      <tr
                        key={it.id}
                        className={`transition-colors ${
                          selected.has(it.id)
                            ? "bg-[var(--color-accent)]/8"
                            : "hover:bg-[var(--color-bg-subtle)]/50"
                        }`}
                      >
                        <td className="py-2.5 pl-3 pr-0">
                          <input
                            type="checkbox"
                            checked={selected.has(it.id)}
                            onChange={() => toggleUno(it.id)}
                            aria-label={`Seleccionar ${it.nombre}`}
                            className="accent-[var(--color-accent)] cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {it.imagen ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={it.imagen}
                                alt=""
                                className="w-8 h-8 rounded object-cover border border-[var(--color-border)] flex-shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-[var(--color-bg-muted)] flex items-center justify-center flex-shrink-0">
                                <Boxes className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-[var(--color-fg)] truncate max-w-[220px]">
                                  {it.nombre}
                                </span>
                                {it.link && (
                                  <a
                                    href={it.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              <p className="text-[11px] text-[var(--color-fg-muted)] truncate max-w-[240px]">
                                {[it.variante, it.sku && `SKU ${it.sku}`, ORIGEN_LABEL[it.origen]]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant={ESTADO_VARIANT[it.estado]} size="sm">
                            {ESTADO_LABEL[it.estado]}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tnum">
                          <span
                            className={
                              c.stock === 0
                                ? "text-[var(--color-fg-subtle)]"
                                : "font-semibold text-[var(--color-fg)]"
                            }
                          >
                            {c.stock}
                          </span>
                          <span className="text-[var(--color-fg-subtle)]"> / {it.cantidadInicial}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tnum text-[var(--color-fg-muted)]">
                          {it.cantidadVendida}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tnum">
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-medium">{fmtARS(c.costoUnitARS)}</span>
                            {c.costoUnitUSD > 0 && (
                              <span className="text-[11px] text-[var(--color-fg-subtle)]">
                                {fmtUSD(c.costoUnitUSD)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tnum font-medium text-[var(--color-accent)]">
                          {fmtARS(c.precioVentaARS)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tnum">
                          <span
                            className={
                              c.margenUnitPct >= 0
                                ? "text-[var(--color-fg)]"
                                : "text-[var(--color-danger)]"
                            }
                          >
                            {fmtPct(c.margenUnitPct)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tnum">
                          <span
                            className={
                              c.gananciaRealizadaARS > 0
                                ? "text-[var(--color-success)] font-semibold"
                                : c.gananciaRealizadaARS < 0
                                ? "text-[var(--color-danger)] font-semibold"
                                : "text-[var(--color-fg-subtle)]"
                            }
                          >
                            {c.gananciaRealizadaARS > 0 ? "+" : ""}
                            {fmtARS(c.gananciaRealizadaARS)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              icon={<ShoppingCart className="h-3.5 w-3.5" />}
                              disabled={c.stock === 0}
                              onClick={() => setVentaFor(it)}
                              title="Registrar venta"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              icon={<Pencil className="h-3.5 w-3.5" />}
                              onClick={() => openEdit(it)}
                              title="Editar"
                            />
                            <button
                              onClick={() => setConfirmDeleteId(it.id)}
                              className="h-7 px-2 flex items-center text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] rounded transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet: una tarjeta por item, sin scroll horizontal */}
            <div className="lg:hidden divide-y divide-[var(--color-border)]">
              {filtered.map((it) => {
                const c = calcInventoryItem(it);
                return (
                  <div
                    key={it.id}
                    className={`p-4 space-y-3 ${selected.has(it.id) ? "bg-[var(--color-accent)]/8" : ""}`}
                  >
                    {/* Cabecera */}
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggleUno(it.id)}
                        aria-label={`Seleccionar ${it.nombre}`}
                        className="accent-[var(--color-accent)] cursor-pointer mt-1 shrink-0"
                      />
                      {it.imagen ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imagen}
                          alt=""
                          className="w-11 h-11 rounded-[var(--radius-sm)] object-cover border border-[var(--color-border)] shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-[var(--radius-sm)] bg-[var(--color-bg-muted)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                          <Boxes className="h-4 w-4 text-[var(--color-fg-subtle)]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm text-[var(--color-fg)] truncate">
                            {it.nombre}
                          </span>
                          {it.link && (
                            <a
                              href={it.link}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Abrir el producto en CSSBuy"
                              className="text-[var(--color-fg-subtle)] shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--color-fg-muted)] truncate">
                          {[it.variante, it.sku && `SKU ${it.sku}`, ORIGEN_LABEL[it.origen]]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge variant={ESTADO_VARIANT[it.estado]} size="sm" className="shrink-0">
                        {ESTADO_LABEL[it.estado]}
                      </Badge>
                    </div>

                    {/* Stock y plata */}
                    <div className="grid grid-cols-2 gap-3 rounded-[var(--radius)] bg-[var(--color-bg-subtle)] px-3 py-2.5">
                      <div className="min-w-0">
                        <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                          Stock
                        </span>
                        <span className="font-mono tnum text-sm">
                          <span
                            className={
                              c.stock === 0
                                ? "text-[var(--color-fg-subtle)]"
                                : "font-semibold text-[var(--color-fg)]"
                            }
                          >
                            {c.stock}
                          </span>
                          <span className="text-[var(--color-fg-subtle)]"> / {it.cantidadInicial}</span>
                          <span className="text-[var(--color-fg-muted)]"> · {it.cantidadVendida} vend.</span>
                        </span>
                      </div>
                      <div className="min-w-0 text-right">
                        <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                          Margen
                        </span>
                        <span
                          className={`font-mono tnum text-sm font-semibold ${
                            c.margenUnitPct >= 0
                              ? "text-[var(--color-fg)]"
                              : "text-[var(--color-danger)]"
                          }`}
                        >
                          {fmtPct(c.margenUnitPct)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                          Costo unit.
                        </span>
                        <span className="font-mono tnum text-sm">{fmtARS(c.costoUnitARS)}</span>
                      </div>
                      <div className="min-w-0 text-right">
                        <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                          Precio venta
                        </span>
                        <span className="font-mono tnum text-sm font-semibold text-[var(--color-accent)]">
                          {fmtARS(c.precioVentaARS)}
                        </span>
                      </div>
                    </div>

                    {/* Ganancia + acciones */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                          Ganancia realizada
                        </span>
                        <span
                          className={`font-mono tnum text-sm ${
                            c.gananciaRealizadaARS > 0
                              ? "text-[var(--color-success)] font-semibold"
                              : c.gananciaRealizadaARS < 0
                                ? "text-[var(--color-danger)] font-semibold"
                                : "text-[var(--color-fg-subtle)]"
                          }`}
                        >
                          {c.gananciaRealizadaARS > 0 ? "+" : ""}
                          {fmtARS(c.gananciaRealizadaARS)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<ShoppingCart className="h-3.5 w-3.5" />}
                          disabled={c.stock === 0}
                          onClick={() => setVentaFor(it)}
                        >
                          Vender
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          icon={<Pencil className="h-4 w-4" />}
                          onClick={() => openEdit(it)}
                          title="Editar item"
                          aria-label="Editar item"
                        />
                        <button
                          onClick={() => setConfirmDeleteId(it.id)}
                          className="px-2 py-1.5 flex items-center text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                          title="Eliminar item"
                          aria-label="Eliminar item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>

      {/* Dialog: nuevo / editar */}
      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        form={form}
        setForm={setForm}
        editing={Boolean(editing)}
        saving={saving}
        onSubmit={submitForm}
      />

      {/* Dialog: registrar venta */}
      <VentaDialog
        item={ventaFor}
        onOpenChange={(open) => !open && setVentaFor(null)}
        onConfirm={registrarVenta}
      />

      {/* Dialog: importar de CSSBuy */}
      <ImportCssbuyDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existing={items}
        onDone={load}
      />

      {/* Edición masiva */}
      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={selectedVisibles}
        saving={bulkSaving}
        onApply={aplicarBulk}
      />

      {/* Exportar a Tiendanube: lo seleccionado, o todo lo filtrado */}
      <TiendanubeExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        items={selectedVisibles.length > 0 ? selectedVisibles : filtered}
      />

      {/* Confirmar borrado masivo */}
      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`¿Eliminar ${selectedVisibles.length} ${selectedVisibles.length === 1 ? "ítem" : "ítems"}?`}
        description="Se borran del inventario junto con su historial de ventas. No se puede deshacer."
        confirmText="Eliminar"
        variant="danger"
        loading={bulkSaving}
        onConfirm={borrarBulk}
      />

      {/* Confirmar borrado */}
      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="¿Eliminar ítem del inventario?"
        description="Se borra el ítem y su historial de stock y ventas. Esta acción no se puede deshacer."
        confirmText="Eliminar"
        loading={deleting}
        onConfirm={doDelete}
      />
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────────────────── */

function NumberField({
  label,
  value,
  onChange,
  prefix,
  step,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  step?: string;
  min?: number;
}) {
  return (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      prefix={prefix}
      value={value === 0 || !Number.isFinite(value) ? "" : value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}

function ItemFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editing,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  editing: boolean;
  saving: boolean;
  onSubmit: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const preview = calcInventoryItem({
    id: "preview",
    nombre: form.nombre,
    cantidadInicial: form.cantidadInicial,
    cantidadVendida: form.cantidadVendida,
    costoUnitUSD: form.costoUnitUSD,
    costoUnitARS: form.costoUnitARS,
    precioVentaARS: form.precioVentaARS,
    estado: form.estado,
    origen: "manual",
    createdAt: "",
    updatedAt: "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar ítem" : "Nuevo ítem de inventario"}</DialogTitle>
          <DialogDescription>
            El costo unitario en ARS es la base para la ganancia. El costo en USD es solo referencia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <Input
            label="Nombre"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Ej: Auriculares TWS X15"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Variante"
              value={form.variante}
              onChange={(e) => set("variante", e.target.value)}
              placeholder="Color, talle…"
            />
            <Input
              label="SKU"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Link"
              value={form.link}
              onChange={(e) => set("link", e.target.value)}
              placeholder="https://…"
            />
            <Input
              label="Imagen (URL)"
              value={form.imagen}
              onChange={(e) => set("imagen", e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumberField
              label="Compradas"
              value={form.cantidadInicial}
              onChange={(n) => set("cantidadInicial", n)}
            />
            <NumberField
              label="Vendidas"
              value={form.cantidadVendida}
              onChange={(n) => set("cantidadVendida", n)}
            />
            <NumberField
              label="Costo unit. ARS"
              prefix="$"
              step="0.01"
              value={form.costoUnitARS}
              onChange={(n) => set("costoUnitARS", n)}
            />
            <NumberField
              label="Costo unit. USD"
              prefix="$"
              step="0.01"
              value={form.costoUnitUSD}
              onChange={(n) => set("costoUnitUSD", n)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumberField
              label="Precio venta ARS"
              prefix="$"
              step="0.01"
              value={form.precioVentaARS}
              onChange={(n) => set("precioVentaARS", n)}
            />
            <Input
              label="Ubicación"
              value={form.ubicacion}
              onChange={(e) => set("ubicacion", e.target.value)}
              placeholder="Estante, caja…"
            />
            <div className="col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
                Estado
              </label>
              <Segmented
                size="sm"
                value={form.estado}
                onChange={(v) => set("estado", v as InventoryEstado)}
                options={[
                  { value: "en_deposito", label: "En depósito" },
                  { value: "en_transito", label: "En tránsito" },
                  { value: "agotado", label: "Agotado" },
                ]}
              />
            </div>
          </div>

          <Input
            label="Notas"
            value={form.notas}
            onChange={(e) => set("notas", e.target.value)}
            placeholder="Opcional"
          />

          {/* Preview */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] text-xs">
            <div>
              <span className="text-[11px] text-[var(--color-fg-muted)] uppercase">Stock</span>
              <p className="font-bold font-mono tnum text-sm">{preview.stock}</p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--color-fg-muted)] uppercase">Margen unit.</span>
              <p className="font-bold font-mono tnum text-sm">{fmtPct(preview.margenUnitPct)}</p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--color-fg-muted)] uppercase">Gan. potencial</span>
              <p className="font-bold font-mono tnum text-sm text-[var(--color-success)]">
                {fmtARS(preview.gananciaPotencialARS)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={onSubmit}>
            {editing ? "Guardar cambios" : "Agregar al inventario"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VentaDialog({
  item,
  onOpenChange,
  onConfirm,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (it: InventoryItem, unidades: number, precioUnit: number) => void;
}) {
  const [unidades, setUnidades] = useState(1);
  const [precio, setPrecio] = useState(0);

  useEffect(() => {
    if (item) {
      setUnidades(1);
      setPrecio(item.precioVentaARS || 0);
    }
  }, [item]);

  const calc = item ? calcInventoryItem(item) : null;

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      {item && calc && (
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar venta</DialogTitle>
            <DialogDescription>
              {item.nombre}
              {item.variante ? ` · ${item.variante}` : ""} — {calc.stock} unidades disponibles
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Unidades"
              min={1}
              value={unidades}
              onChange={(n) => setUnidades(Math.max(1, Math.min(calc.stock, Math.round(n))))}
            />
            <NumberField
              label="Precio unit. ARS"
              prefix="$"
              step="0.01"
              value={precio}
              onChange={setPrecio}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] text-xs">
            <div>
              <span className="text-[11px] text-[var(--color-fg-muted)] uppercase">Ingreso</span>
              <p className="font-bold font-mono tnum text-sm text-[var(--color-accent)]">
                {fmtARS(precio * unidades)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--color-fg-muted)] uppercase">Ganancia</span>
              <p className="font-bold font-mono tnum text-sm text-[var(--color-success)]">
                {fmtARS((precio - calc.costoUnitARS) * unidades)}
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              onClick={() => onConfirm(item, unidades, precio)}
            >
              Registrar venta
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ── Importación desde CSSBuy ────────────────────────────────────────── */

interface ImportRow {
  order: CssbuyOrder;
  checked: boolean;
  cantidad: number;
  yaImportado: boolean;
}

function ImportCssbuyDialog({
  open,
  onOpenChange,
  existing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: InventoryItem[];
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [blue, setBlue] = useState(1300);
  const [cny, setCny] = useState(7.2);
  const [markup, setMarkup] = useState(2);

  const importedRefs = useMemo(
    () =>
      new Set(
        existing
          .filter((it) => it.origen === "cssbuy" && it.origenRef)
          .map((it) => it.origenRef as string)
      ),
    [existing]
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [fx, data] = await Promise.all([
        fetchLiveFx().catch(() => null),
        fetcher<{ ok: boolean; orders: CssbuyOrder[]; message?: string }>("/api/cssbuy/sync"),
      ]);
      if (fx?.blue) setBlue(Math.round(fx.blue));
      if (fx?.cny) setCny(Number(fx.cny.toFixed(2)));
      const orders = data.orders || [];
      setRows(
        orders.map((order) => ({
          order,
          checked: !importedRefs.has(order.oid),
          cantidad: Math.max(1, Math.round(order.cantidad || 1)),
          yaImportado: importedRefs.has(order.oid),
        }))
      );
      if (orders.length === 0) {
        setMsg(data.message || "No hay órdenes CSSBuy sincronizadas. Corré 'Sync' primero.");
      }
    } catch (err: any) {
      setMsg(err?.info?.error || err?.message || "No se pudieron leer las órdenes de CSSBuy");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [importedRefs]);

  useEffect(() => {
    if (open) loadOrders();
  }, [open, loadOrders]);

  const cnyToArs = (v: number) => (cny > 0 ? (v / cny) * blue : 0);
  const cnyToUsd = (v: number) => (cny > 0 ? v / cny : 0);

  const seleccionados = rows.filter((r) => r.checked && !r.yaImportado);

  async function doImport() {
    if (seleccionados.length === 0) return;
    setImporting(true);
    try {
      const items = seleccionados.map((r) => {
        const costoCny = (r.order.precio_unitario_cny || 0) + (r.order.envio_local_cny || 0);
        const costoUnitARS = cnyToArs(costoCny);
        return {
          nombre: r.order.producto || `Orden ${r.order.oid}`,
          variante: r.order.variante || null,
          imagen: r.order.imagen || null,
          link: r.order.url || null,
          cantidadInicial: r.cantidad,
          cantidadVendida: 0,
          costoUnitARS,
          costoUnitUSD: cnyToUsd(costoCny),
          precioVentaARS: Math.round(costoUnitARS * markup),
          estado: "en_deposito" as const,
          origen: "cssbuy" as const,
          origenRef: r.order.oid,
        };
      });
      const res = await fetcherPost<{ count: number }>("/api/inventario", { items });
      toast.success(`Importados ${res.count} ítems desde CSSBuy`);
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast.error("No se pudo importar", {
        description: err?.info?.error || err?.message,
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar de CSSBuy</DialogTitle>
          <DialogDescription>
            Trae las órdenes ya sincronizadas como ítems de inventario. El costo se estima
            convirtiendo CNY → ARS (precio + flete interno); no incluye flete internacional ni
            impuestos AR, ajustalo después.
          </DialogDescription>
        </DialogHeader>

        {/* Parámetros de conversión */}
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Dólar blue" prefix="$" value={blue} onChange={setBlue} />
          <NumberField label="CNY por USD" step="0.01" value={cny} onChange={setCny} />
          <NumberField label="Markup venta" step="0.1" value={markup} onChange={setMarkup} />
        </div>

        <div className="mt-3 flex-1 overflow-y-auto min-h-[120px]">
          {loading ? (
            <div className="p-10 flex justify-center">
              <Spinner className="h-7 w-7" />
            </div>
          ) : msg ? (
            <p className="text-xs text-[var(--color-fg-muted)] py-6 text-center">{msg}</p>
          ) : (
            <div className="border border-[var(--color-border)] rounded-[var(--radius)] divide-y divide-[var(--color-border)]">
              {rows.map((r, idx) => {
                const costoCny =
                  (r.order.precio_unitario_cny || 0) + (r.order.envio_local_cny || 0);
                return (
                  <label
                    key={r.order.oid || idx}
                    className={`flex items-center gap-3 p-2.5 text-xs ${
                      r.yaImportado ? "opacity-50" : "cursor-pointer hover:bg-[var(--color-bg-subtle)]/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={r.checked}
                      disabled={r.yaImportado}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, checked: e.target.checked } : x
                          )
                        )
                      }
                      className="accent-[var(--color-fg)]"
                    />
                    {r.order.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.order.imagen}
                        alt=""
                        className="w-8 h-8 rounded object-cover border border-[var(--color-border)] flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-[var(--color-bg-muted)] flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--color-fg)] truncate max-w-[280px]">
                        {r.order.producto || `Orden ${r.order.oid}`}
                      </p>
                      <p className="text-[11px] text-[var(--color-fg-muted)] truncate">
                        {[r.order.variante, `¥${costoCny.toFixed(2)}`, r.order.estado]
                          .filter(Boolean)
                          .join(" · ")}
                        {r.yaImportado && " · ya importado"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="number"
                        min={1}
                        value={r.cantidad}
                        disabled={r.yaImportado}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, cantidad: Math.max(1, Math.round(Number(e.target.value) || 1)) }
                                : x
                            )
                          )
                        }
                        className="w-14 h-7 px-2 text-xs text-right bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-border-focus)]"
                      />
                      <span className="font-mono tnum text-[11px] text-[var(--color-fg-muted)] w-24 text-right">
                        {fmtARS(cnyToArs(costoCny))}/u
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border)]">
          <span className="text-[11px] text-[var(--color-fg-muted)]">
            {seleccionados.length} de {rows.length} seleccionados
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={importing}
              disabled={seleccionados.length === 0}
              icon={<DownloadCloud className="h-3.5 w-3.5" />}
              onClick={doImport}
            >
              Importar {seleccionados.length || ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
