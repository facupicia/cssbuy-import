"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
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
  Layers,
  Store,
  X,
  FileText,
  Tag,
  Hash,
  MoreHorizontal,
  ArrowLeft,
} from "lucide-react";
import {
  InventoryItem,
  InventoryEstado,
  InventoryOrigen,
  CssbuyOrder,
  Marca,
  InventoryTalle,
  InventoryTalleCalc,
  StoreProductProfile,
} from "@/lib/types";
import {
  calcInventoryItem,
  summarizeInventory,
  suggestEstado,
  ESTADO_LABEL,
} from "@/lib/inventory";
import { fmtARS, fmtUSD, fmtPct } from "@/lib/utils";
import {
  parseTalle,
  varianteSinTalle,
  resumenVariante,
  parseColor,
  canonizar,
  compararTalles,
  tallesDeItems,
} from "@/lib/variantes";
import { generarSku, generarSkuParaTalle } from "@/lib/sku";
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
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/Menu";
import { TiendanubeExportDialog } from "@/components/inventario/TiendanubeExportDialog";
import { BulkEditDialog, type BulkChanges } from "@/components/inventario/BulkEditDialog";
import { CotizacionPrecioPicker } from "@/components/inventario/CotizacionPrecioPicker";
import type { ProductoCotizado } from "@/lib/inventory-sync";
import { SyncCotizacionDialog } from "@/components/inventario/SyncCotizacionDialog";
import { MarcasDialog } from "@/components/inventario/MarcasDialog";
import { DescripcionDialog } from "@/components/inventario/DescripcionDialog";
import { InventoryFilters } from "@/components/inventario/InventoryFilters";
import { InventoryPagination } from "@/components/inventario/InventoryPagination";
import { EMPTY_INVENTORY_FILTERS, filtrarInventario, paginarInventario, categoriaInventario, colorInventario, type InventoryFilters as InventoryFilterState } from "@/lib/inventory-list";
import { StoreProductFields } from "@/components/inventario/StoreProductFields";
import { StorePublishDialog } from "@/components/inventario/StorePublishDialog";
import { generarDescripcionTiendaHTML } from "@/lib/descripcion";
import { tablaDeMarca } from "@/lib/tablas-talle";
import { precioPublicado, parseVariante } from "@/lib/tiendanube";
import { EMPTY_STORE_PROFILE, sanitizeStoreProfile } from "@/lib/store-product";

/* ── Formulario de ítem ──────────────────────────────────────────────── */

interface FormState {
  nombre: string;
  variante: string;
  sku: string;
  link: string;
  imagen: string;
  tienda: StoreProductProfile;
  cantidadInicial: number;
  cantidadVendida: number;
  costoUnitARS: number;
  costoUnitUSD: number;
  precioVentaARS: number;
  estado: InventoryEstado;
  ubicacion: string;
  notas: string;
  /** "" = sin marca. */
  marcaId: string;
  /** Si está activo, el stock se maneja individualmente por cada talle */
  modoTalles: boolean;
  talles: InventoryTalle[];
  /**
   * oid de CSSBuy que vincula el ítem con su producto en las cotizaciones.
   * Un ítem cargado a mano lo toma al traerle el precio de una cotización.
   */
  origenRef: string;
}

const EMPTY_FORM: FormState = {
  nombre: "",
  variante: "",
  sku: "",
  link: "",
  imagen: "",
  tienda: { ...EMPTY_STORE_PROFILE, fotos: [] },
  cantidadInicial: 1,
  cantidadVendida: 0,
  costoUnitARS: 0,
  costoUnitUSD: 0,
  precioVentaARS: 0,
  estado: "en_deposito",
  ubicacion: "",
  notas: "",
  marcaId: "",
  modoTalles: false,
  talles: [],
  origenRef: "",
};

function itemToForm(it: InventoryItem): FormState {
  const tieneTalles = Array.isArray(it.talles) && it.talles.length > 0;
  return {
    nombre: it.nombre ?? "",
    variante: it.variante ?? "",
    sku: it.sku ?? "",
    link: it.link ?? "",
    imagen: it.imagen ?? "",
    tienda: it.tienda ?? { ...EMPTY_STORE_PROFILE, fotos: [] },
    cantidadInicial: it.cantidadInicial ?? 0,
    cantidadVendida: it.cantidadVendida ?? 0,
    costoUnitARS: it.costoUnitARS ?? 0,
    costoUnitUSD: it.costoUnitUSD ?? 0,
    precioVentaARS: it.precioVentaARS ?? 0,
    estado: it.estado ?? "en_deposito",
    ubicacion: it.ubicacion ?? "",
    notas: it.notas ?? "",
    marcaId: it.marcaId ?? "",
    modoTalles: tieneTalles,
    talles: tieneTalles ? it.talles!.map((t) => ({ ...t })) : [],
    origenRef: it.origenRef ?? "",
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

type OrdenInventario = "reciente" | "margen" | "capital" | "stock" | "nombre";

/* ── Página ──────────────────────────────────────────────────────────── */

export default function InventarioPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InventoryFilterState>(EMPTY_INVENTORY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [ventaFor, setVentaFor] = useState<InventoryItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  // Selección múltiple para las acciones en lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("tiendanube")) setPublishOpen(true);
  }, []);
  const [returnToPublish, setReturnToPublish] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [orden, setOrden] = useState<OrdenInventario>("reciente");
  const [syncCotOpen, setSyncCotOpen] = useState(false);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcasOpen, setMarcasOpen] = useState(false);
  const [generandoSkus, setGenerandoSkus] = useState(false);
  const [fichaDe, setFichaDe] = useState<InventoryItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, dm] = await Promise.all([
        fetcher<{ items: InventoryItem[] }>("/api/inventario"),
        // Las marcas son secundarias: si fallan, el inventario igual se muestra.
        fetcher<{ marcas: Marca[] }>("/api/marcas").catch(() => ({ marcas: [] as Marca[] })),
      ]);
      setItems(data.items || []);
      setMarcas(dm.marcas || []);
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
    return filtrarInventario(items, filters, search)
      .sort((a, b) => {
        const ca = calcInventoryItem(a);
        const cb = calcInventoryItem(b);
        switch (orden) {
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
  }, [items, search, filters, orden]);

  // El SKU del ítem que se edita no cuenta como "en uso": si no, regenerarlo
  // saltaría al siguiente número sin motivo. Los SKU de cada talle sí cuentan:
  // también van en etiquetas y no se pueden repetir.
  const skusEnUso = useMemo(
    () =>
      items
        .filter((i) => i.id !== editing?.id)
        .flatMap((i) => [i.sku, ...(i.talles ?? []).map((t) => t.sku)])
        .filter(Boolean) as string[],
    [items, editing]
  );

  const nombreMarca = useMemo(
    () => Object.fromEntries(marcas.map((m) => [m.id, m.nombre])),
    [marcas]
  );

  const filterOptions = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));
    const usedBrands = unique(items.map(i => i.marcaId || "sin_marca"));
    return {
      estados: Object.entries(ESTADO_LABEL).map(([value, label]) => ({ value, label })),
      marcas: usedBrands.map(value => ({ value, label: value === "sin_marca" ? "Sin marca" : nombreMarca[value] || "Marca sin nombre" })),
      talles: tallesDeItems(items).map(value => ({ value, label: value })),
      colores: unique(items.map(colorInventario)).map(value => ({ value, label: value })),
      categorias: unique(items.map(categoriaInventario)).map(value => ({ value, label: value })),
      origenes: unique(items.map(i => i.origen)).map(value => ({ value, label: ORIGEN_LABEL[value as InventoryOrigen] })),
      stock: [{ value: "disponible", label: "Con stock" }, { value: "bajo", label: "Poco stock (1 a 3 unidades)" }, { value: "agotado", label: "Sin stock" }],
    };
  }, [items, nombreMarca]);
  const pagination = useMemo(() => paginarInventario(filtered, page, pageSize), [filtered, page, pageSize]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filters, search]);
  useEffect(() => {
    const matchingIds = new Set(filtered.map(item => item.id));
    setSelected(current => [...current].some(id => !matchingIds.has(id)) ? new Set([...current].filter(id => matchingIds.has(id))) : current);
  }, [filtered]);
  useEffect(() => { setPage(1); }, [orden, pageSize]);
  // Clamp after removing the final products on a page; don't render an empty trailing page.
  useEffect(() => { setPage(current => Math.min(current, pagination.pages)); }, [pagination.pages]);
  const visibleIds = useMemo(() => new Set(pagination.items.map(it => it.id)), [pagination.items]);
  const selectedVisibles = useMemo(() => filtered.filter(it => selected.has(it.id)), [filtered, selected]);
  const todosSeleccionados = pagination.items.length > 0 && pagination.items.every(it => selected.has(it.id));
  function changePage(next: number) {
    setPage(next);
    document.getElementById("inventory-products")?.scrollIntoView({ block: "start" });
  }
  function clearFilters() { setFilters(EMPTY_INVENTORY_FILTERS); setSearch(""); }

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
        { ids, patch: cambios.patch, precio: cambios.precio, textos: cambios.textos }
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

  async function generarSkus() {
    const ids = selectedVisibles.map((it) => it.id);
    if (ids.length === 0) return;
    setGenerandoSkus(true);
    try {
      const res = await fetcherPost<{ actualizados: number; message?: string }>(
        "/api/inventario/skus",
        { ids }
      );
      if (res.actualizados > 0) {
        toast.success(
          `${res.actualizados} ${res.actualizados === 1 ? "SKU generado" : "SKUs generados"}`
        );
        limpiarSeleccion();
        await load();
      } else {
        toast.info(res.message || "No había nada para generar");
      }
    } catch (err: any) {
      toast.error("No se pudieron generar los SKUs", {
        description: err?.info?.error || err?.message,
      });
    } finally {
      setGenerandoSkus(false);
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
    setFormError("");
    setReturnToPublish(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(it: InventoryItem) {
    setFormError("");
    setEditing(it);
    setForm(itemToForm(it));
    setFormOpen(true);
  }

  async function submitForm() {
    setFormError("");
    try { sanitizeStoreProfile(form.tienda); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Revisá la ficha de tienda"); return; }
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (form.modoTalles && form.talles.length === 0) {
      toast.error("Agregá al menos un talle o cambiá a talle único");
      return;
    }

    const tallesPayload = form.modoTalles ? form.talles : null;
    const pasado = tallesPayload?.find((t) => t.cantidadVendida > t.cantidadInicial);
    if (pasado) {
      toast.error(`En el talle ${pasado.talle} las vendidas superan a las compradas`);
      return;
    }
    const cantInicial = tallesPayload
      ? tallesPayload.reduce((s, t) => s + t.cantidadInicial, 0)
      : form.cantidadInicial;
    const cantVendida = tallesPayload
      ? tallesPayload.reduce((s, t) => s + t.cantidadVendida, 0)
      : form.cantidadVendida;

    if (cantVendida > cantInicial) {
      toast.error("Las unidades vendidas no pueden superar a las compradas");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nombre: form.nombre.trim(),
        cantidadInicial: cantInicial,
        cantidadVendida: cantVendida,
        talles: tallesPayload,
        estado:
          form.estado ??
          suggestEstado(cantInicial, cantVendida),
        // La columna es UUID: "" no es un id válido, va null.
        marcaId: form.marcaId || null,
      };
      if (editing) {
        await fetcherPatch(`/api/inventario/${editing.id}`, payload);
        toast.success("Producto actualizado");
      } else {
        await fetcherPost("/api/inventario", { ...payload, origen: "manual" });
        toast.success("Producto creado en inventario");
      }
      setFormOpen(false);
      await load();
      if (returnToPublish) { setReturnToPublish(false); setPublishOpen(true); }
    } catch (err: any) {
      const message = err?.info?.error || err?.message || "Revisá la conexión y volvé a guardar. Tus cambios siguen en esta ficha.";
      setFormError(message);
      toast.error("No se pudo guardar", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function registrarVenta(
    it: InventoryItem,
    unidades: number,
    precioUnit: number,
    talleSeleccionado?: string
  ) {
    const calc = calcInventoryItem(it);
    const patch: Record<string, unknown> = { precioVentaARS: precioUnit };

    if (calc.tallesCalc) {
      // Con talles, la venta se descuenta del talle: el servidor recalcula el
      // total a partir de ellos, así que sumar solo al total se perdería.
      const talle = calc.tallesCalc.find((t) => t.talle === talleSeleccionado);
      if (!talle) {
        toast.error("Elegí el talle vendido");
        return;
      }
      if (unidades <= 0 || unidades > talle.stock) {
        toast.error(`Solo hay ${talle.stock} unidades del talle ${talle.talle}`);
        return;
      }
      patch.talles = calc.tallesCalc.map(({ stock: _stock, ...t }) =>
        t.talle === talle.talle ? { ...t, cantidadVendida: t.cantidadVendida + unidades } : t
      );
    } else if (unidades <= 0 || unidades > calc.stock) {
      toast.error(`Solo hay ${calc.stock} unidades disponibles`);
      return;
    }

    const nuevaVendida = calc.cantidadVendida + unidades;
    patch.cantidadVendida = nuevaVendida;
    if (nuevaVendida >= calc.cantidadInicial) patch.estado = "agotado";
    try {
      await fetcherPatch(`/api/inventario/${it.id}`, patch);
      toast.success(
        `Venta registrada: ${unidades} u.${talleSeleccionado ? ` (${talleSeleccionado})` : ""} de "${it.nombre}"`,
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

      <main hidden={formOpen} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-fg)]">
              Inventario
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-fg-muted)] mt-0.5">
              Administrá tus prendas y sus existencias. Creá o editá una ficha y publicala cuando esté lista.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={openNew}
            >
              Crear producto
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<DownloadCloud className="h-3.5 w-3.5" />}
              onClick={() => setImportOpen(true)}
            >
              Importar de CSSBuy
            </Button>
            <Button variant="outline" size="sm" icon={<Store className="h-3.5 w-3.5" />} onClick={() => { setReturnToPublish(false); setPublishOpen(true); }}>Tiendanube</Button>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline" size="sm" icon={<MoreHorizontal className="h-3.5 w-3.5" />}>
                  Herramientas
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Tag className="h-3.5 w-3.5" />} onSelect={() => setMarcasOpen(true)}>
                  Administrar marcas
                </MenuItem>
                <MenuItem icon={<FileText className="h-3.5 w-3.5" />} disabled={items.length === 0} onSelect={() => setSyncCotOpen(true)}>
                  Traer precios de cotizaciones
                </MenuItem>
                <MenuItem icon={<Store className="h-3.5 w-3.5" />} disabled={items.length === 0} onSelect={() => setExportOpen(true)}>
                  Exportar a Tiendanube
                </MenuItem>
                <MenuItem icon={<Store className="h-3.5 w-3.5" />} onSelect={() => setPublishOpen(true)}>
                  Preparar y publicar productos
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={load}
              title="Refrescar"
              aria-label="Refrescar inventario"
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card padding="sm">
              <StatTile
                label="Unidades en stock"
                value={String(summary.unidadesStock)}
                sub="En depósito y en tránsito"
                icon={<Layers className="h-3.5 w-3.5" />}
              />
            </Card>
            <Card padding="sm">
              <StatTile
                label="Facturado"
                value={fmtARS(summary.ingresoRealizadoARS)}
                sub={`${summary.unidadesVendidas} unidades vendidas · Total acumulado`}
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
              />
            </Card>
            <Card padding="sm">
              <StatTile
                label="Ganancia de las ventas"
                value={fmtARS(summary.gananciaRealizadaARS)}
                sub="Facturado menos costo de las prendas vendidas. Antes de publicidad y comisiones."
                icon={<Wallet2 className="h-3.5 w-3.5" />}
                tone={summary.gananciaRealizadaARS < 0 ? "danger" : "accent"}
              />
            </Card>
          </div>
        )}

        {items.length > 0 && <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="relative w-full sm:max-w-md"><span className="sr-only">Buscar productos por nombre, SKU o variante</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]" /><input type="search" placeholder="Buscar por nombre, SKU o variante…" aria-label="Buscar productos por nombre, SKU o variante" value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] pl-9 pr-3 text-sm focus-visible:outline-2" /></label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">Ordenar<select value={orden} onChange={e => setOrden(e.target.value as OrdenInventario)} aria-label="Ordenar el inventario" className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-2"><option value="reciente">Más reciente</option><option value="margen">Margen</option><option value="capital">Capital inmovilizado</option><option value="stock">Stock</option><option value="nombre">Nombre</option></select></label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">Por página<select aria-label="Productos por página" value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-2">{[10,20,50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          <InventoryFilters value={filters} onChange={setFilters} options={filterOptions} search={search} onClear={() => setSearch("")} />
        </>}

        {/* Acciones sobre la selección */}
        {selectedVisibles.length > 0 && (
          <div className="sticky top-16 sm:top-20 z-30 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/8 backdrop-blur-md px-3 py-2.5">
            <span className="text-xs font-semibold text-[var(--color-accent)]">
              {selectedVisibles.length} {selectedVisibles.length === 1 ? "seleccionado" : "seleccionados"} en los resultados
            </span>
            {selectedVisibles.length < filtered.length && <button type="button" onClick={() => setSelected(new Set(filtered.map(i => i.id)))} className="text-xs underline underline-offset-4 focus-visible:outline-2">Seleccionar los {filtered.length} resultados</button>}
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => setBulkOpen(true)}
            >
              Editar selección
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Hash className="h-3.5 w-3.5" />}
              onClick={generarSkus}
              loading={generandoSkus}
              title="Genera el SKU de los que todavía no tienen"
            >
              Generar SKU
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Store className="h-3.5 w-3.5" />}
              onClick={() => setPublishOpen(true)}
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

        <div id="inventory-products" className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Productos <span className="ml-1 text-sm font-normal text-[var(--color-fg-muted)]">{filtered.length}{filtered.length !== items.length ? ` de ${items.length}` : ""}</span></h2><p className="text-xs text-[var(--color-fg-muted)]">Abrí una prenda para editar su ficha</p>{pagination.items.length > 0 && <label className="flex w-full items-center gap-2 text-sm lg:hidden"><input type="checkbox" aria-label="Seleccionar productos de esta página" checked={todosSeleccionados} onChange={toggleTodos} className="h-4 w-4 accent-[var(--color-accent)]" />Seleccionar esta página</label>}</div>
        {/* Contenido */}
        {loading ? (
          <div role="status" aria-label="Cargando inventario" className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"><span className="sr-only">Cargando productos…</span>{[0,1,2,3].map(i => <div key={i} className="flex items-center gap-4 motion-safe:animate-pulse"><div className="h-12 w-12 rounded-lg bg-[var(--color-bg-muted)]" /><div className="flex-1 space-y-2"><div className="h-3 w-2/5 rounded bg-[var(--color-bg-muted)]" /><div className="h-3 w-1/4 rounded bg-[var(--color-bg-subtle)]" /></div><div className="h-4 w-16 rounded bg-[var(--color-bg-muted)]" /></div>)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-6 w-6" />}
            title={error ? "No se pudo leer el inventario" : "Inventario vacío"}
            description={
              error
                ? "Revisá la conexión a Postgres y volvé a intentar."
                : "Creá tu primera prenda o importá una compra de CSSBuy. Después podrás cargar talles, fotos y precios en su ficha."
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
                    Crear producto
                  </Button>
                </div>
              )
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<PackageX className="h-6 w-6" />}
            title="Sin resultados"
            description="Probá con otro nombre o quitá los filtros para ver todas las prendas."
            action={<Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>}
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
                        aria-label="Seleccionar productos de esta página"
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
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {pagination.items.map((it) => {
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
                                <button type="button" onClick={() => openEdit(it)} className="font-semibold text-sm text-[var(--color-fg)] truncate max-w-[220px] text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{it.nombre}</button>
                                {!c.tallesCalc && parseTalle(it.variante) && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[var(--color-bg-muted)] text-[10px] font-mono font-semibold text-[var(--color-fg-muted)]">
                                    {parseTalle(it.variante)}
                                  </span>
                                )}
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
                                {[
                                  it.marcaId && nombreMarca[it.marcaId],
                                  resumenVariante(it.variante),
                                  it.sku && `SKU ${it.sku}`,
                                  ORIGEN_LABEL[it.origen],
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {c.tallesCalc && <TallesChips talles={c.tallesCalc} />}
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
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => openEdit(it)}>Editar</Button>
                            <Menu><MenuTrigger asChild><Button variant="ghost" size="sm" aria-label={`Más acciones de ${it.nombre}`} icon={<MoreHorizontal className="h-4 w-4" />} /></MenuTrigger><MenuContent><MenuItem icon={<ShoppingCart className="h-4 w-4" />} disabled={c.stock === 0} onSelect={() => setVentaFor(it)}>Registrar venta</MenuItem><MenuItem icon={<FileText className="h-4 w-4" />} onSelect={() => setFichaDe(it)}>Ver ficha pública</MenuItem><MenuItem icon={<Trash2 className="h-4 w-4" />} onSelect={() => setConfirmDeleteId(it.id)}>Eliminar del inventario</MenuItem></MenuContent></Menu>

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
              {pagination.items.map((it) => {
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
                          <button type="button" onClick={() => openEdit(it)} className="font-semibold text-sm text-[var(--color-fg)] truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{it.nombre}</button>
                          {!c.tallesCalc && parseTalle(it.variante) && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[var(--color-bg-muted)] text-[10px] font-mono font-semibold text-[var(--color-fg-muted)]">
                              {parseTalle(it.variante)}
                            </span>
                          )}
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
                          {[
                            it.marcaId && nombreMarca[it.marcaId],
                            resumenVariante(it.variante),
                            it.sku && `SKU ${it.sku}`,
                            ORIGEN_LABEL[it.origen],
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {c.tallesCalc && <TallesChips talles={c.tallesCalc} />}
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

                    <div className="flex items-center justify-between gap-2">
                      <Button variant="outline" size="sm" icon={<ShoppingCart className="h-4 w-4" />} disabled={c.stock === 0} onClick={() => setVentaFor(it)}>Registrar venta</Button>
                      <div className="flex items-center gap-1"><Button variant="outline" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEdit(it)}>Editar</Button><Menu><MenuTrigger asChild><Button variant="ghost" size="sm" aria-label={`Más acciones de ${it.nombre}`} icon={<MoreHorizontal className="h-4 w-4" />} /></MenuTrigger><MenuContent><MenuItem icon={<FileText className="h-4 w-4" />} onSelect={() => setFichaDe(it)}>Ver ficha pública</MenuItem><MenuItem icon={<Trash2 className="h-4 w-4" />} onSelect={() => setConfirmDeleteId(it.id)}>Eliminar del inventario</MenuItem></MenuContent></Menu></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        {!loading && filtered.length > 0 && <InventoryPagination page={pagination.page} pages={pagination.pages} from={pagination.from} to={pagination.to} total={pagination.total} onPage={changePage} />}
      </main>

      {/* Dialog: nuevo / editar */}
      <ProductEditor
        open={formOpen}
        onOpenChange={next => { setFormOpen(next); if (!next && returnToPublish) { setReturnToPublish(false); setPublishOpen(true); } }}
        error={formError}
        form={form}
        setForm={setForm}
        editing={Boolean(editing)}
        saving={saving}
        marcas={marcas}
        nombreDeMarca={nombreMarca}
        skusEnUso={skusEnUso}
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

      {/* Ficha del producto */}
      <DescripcionDialog
        item={fichaDe}
        nombreDeMarca={nombreMarca}
        onOpenChange={(v) => !v && setFichaDe(null)}
      />

      {/* Marcas */}
      <MarcasDialog
        open={marcasOpen}
        onOpenChange={setMarcasOpen}
        items={items}
        onChanged={load}
      />

      {/* Precios desde cotizaciones */}
      <SyncCotizacionDialog
        open={syncCotOpen}
        onOpenChange={setSyncCotOpen}
        onDone={load}
      />

      {/* Edición masiva */}
      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={selectedVisibles}
        marcas={marcas}
        saving={bulkSaving}
        onApply={aplicarBulk}
      />

      {/* Exportar a Tiendanube: lo seleccionado, o todo lo filtrado */}
      <StorePublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        items={selectedVisibles.length > 0 ? selectedVisibles : filtered}
        marcas={marcas}
        onChanged={load}
        onEdit={(item) => { setReturnToPublish(true); openEdit(item); }}
      />
      <TiendanubeExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        items={selectedVisibles.length > 0 ? selectedVisibles : filtered}
        inventario={items}
        marcas={marcas}
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
  decimals,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  step?: string;
  min?: number;
  decimals?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = value === 0 || !Number.isFinite(value)
    ? ""
    : decimals === undefined ? String(value) : value.toFixed(decimals);
  return (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      prefix={prefix}
      value={draft ?? displayValue}
      placeholder="0"
      onFocus={() => { if (decimals !== undefined) setDraft(displayValue); }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        if (decimals !== undefined) setDraft(e.target.value);
        onChange(e.target.value === "" ? 0 : Number(e.target.value));
      }}
    />
  );
}

/** Stock por talle en la fila del inventario; los agotados quedan tachados. */
function TallesChips({ talles }: { talles: InventoryTalleCalc[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {talles.map((t) => (
        <span
          key={t.talle}
          title={`${t.talle}: ${t.stock} disponibles (${t.cantidadVendida} vendidas de ${t.cantidadInicial})${t.sku ? ` · SKU ${t.sku}` : ""}`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-xs)] text-[10px] font-mono border ${
            t.stock > 0
              ? "bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-fg)]"
              : "bg-[var(--color-bg-subtle)] border-dashed border-[var(--color-border)] text-[var(--color-fg-subtle)] line-through opacity-60"
          }`}
        >
          <span className="font-semibold">{t.talle}</span>
          <span className={t.stock > 0 ? "text-[var(--color-accent)] font-bold" : ""}>{t.stock}</span>
        </span>
      ))}
    </div>
  );
}

// En forma canónica (XXL, no 2XL) para que coincidan con el filtro por talle.
const TALLES_ROPA_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const TALLES_CALZADO_PRESETS = ["38", "39", "40", "41", "42", "43", "44", "45"];

// Talle · compradas · vendidas · stock · SKU · quitar. Entra en un celular.
const GRID_TALLES =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem_minmax(0,1.8fr)_1.75rem] items-center gap-1.5 sm:gap-2";
const INPUT_TALLE =
  "w-full h-7 px-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]";

function ProductEditor({
  error,
  open,
  onOpenChange,
  form,
  setForm,
  editing,
  saving,
  marcas,
  nombreDeMarca,
  skusEnUso,
  onSubmit,
}: {
  error: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  editing: boolean;
  saving: boolean;
  marcas: Marca[];
  nombreDeMarca: Record<string, string>;
  /** SKUs ya usados, para que el generado no se repita. */
  skusEnUso: string[];
  onSubmit: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [confirmSingle, setConfirmSingle] = useState(false);
  const [section, setSection] = useState("product");
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [validation, setValidation] = useState("");
  const pendingHref = useRef<string | null>(null);
  const previousScroll = useRef(0);
  const unifiedStock = useRef(false);
  useEffect(() => {
    if (open) { previousScroll.current = window.scrollY; setInitialSnapshot(JSON.stringify(form)); setSection("product"); setValidation(""); setConfirmLeave(false); pendingHref.current = null; unifiedStock.current = false; window.scrollTo(0, 0); }
    else if (initialSnapshot) { window.scrollTo(0, previousScroll.current); setInitialSnapshot(""); }
    // Capture the starting state only when opening this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const changed = initialSnapshot !== "" && JSON.stringify(form) !== initialSnapshot;
    const unload = (e: BeforeUnloadEvent) => { if (changed || saving || processingPhotos) e.preventDefault(); };
    const navigate = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.href === window.location.href || (!changed && !saving && !processingPhotos)) return;
      e.preventDefault(); e.stopPropagation();
      if (!saving && !processingPhotos) { pendingHref.current = anchor.href; setConfirmLeave(true); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [open, form, initialSnapshot, saving, processingPhotos]);
  const [nuevoTalleTxt, setNuevoTalleTxt] = useState("");
  const [cotizacionAbierta, setCotizacionAbierta] = useState(false);
  useEffect(() => { setValidation(""); }, [form]);
  useEffect(() => { if (validation || error) document.getElementById("product-editor-error")?.focus(); }, [validation, error, section]);

  useEffect(() => {
    if (!open) setCotizacionAbierta(false);
  }, [open]);

  /**
   * Trae precio y costo del producto cotizado. El costo va junto porque la
   * cotización ya prorratea flete, impuestos y depósito: dejar el costo viejo
   * inflaría el margen. Si el ítem no tenía oid, toma el del producto para que
   * "Precios de cotización" lo mantenga al día después.
   */
  function traerDeCotizacion(p: ProductoCotizado) {
    setForm((f) => ({
      ...f,
      precioVentaARS: p.precioARS > 0 ? Math.round(p.precioARS) : f.precioVentaARS,
      costoUnitARS: p.costoARS > 0 ? Math.round(p.costoARS) : f.costoUnitARS,
      costoUnitUSD: p.costoUSD > 0 ? p.costoUSD : f.costoUnitUSD,
      tienda: f.tienda.pesoKg || !p.pesoKg ? f.tienda : { ...f.tienda, pesoKg: p.pesoKg },
      origenRef: f.origenRef || p.oid,
    }));
    setCotizacionAbierta(false);
    toast.success(`Precio traído de "${p.cotizacionNombre}"`, {
      description: `Venta ${fmtARS(p.precioARS)} · costo ${fmtARS(p.costoARS)}`,
    });
  }

  // Con varios talles, los totales del ítem son la suma de los talles.
  const setTalles = (fn: (talles: InventoryTalle[]) => InventoryTalle[]) =>
    setForm((f) => {
      const talles = fn(f.talles);
      return {
        ...f,
        talles,
        cantidadInicial: talles.reduce((s, t) => s + t.cantidadInicial, 0),
        cantidadVendida: talles.reduce((s, t) => s + t.cantidadVendida, 0),
      };
    });

  function agregarTalle(nombreTalle: string) {
    // "2XL" y "XXL" son el mismo talle: se guarda la forma canónica.
    const talle = canonizar(nombreTalle);
    if (!talle) return;
    if (form.talles.some((t) => canonizar(t.talle) === talle)) {
      toast.info(`El talle ${talle} ya está en la lista`);
      return;
    }
    setTalles((ts) =>
      [...ts, { talle, cantidadInicial: 1, cantidadVendida: 0, sku: null }].sort((a, b) =>
        compararTalles(a.talle, b.talle)
      )
    );
    setNuevoTalleTxt("");
  }

  function actualizarTalle(index: number, patch: Partial<InventoryTalle>) {
    setTalles((ts) => ts.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function eliminarTalle(index: number) {
    setTalles((ts) => ts.filter((_, i) => i !== index));
  }

  function editableColor() {
    const pair = form.variante.split(";").find(p => /^(color|colores|colour|颜色)\s*:/i.test(p.trimStart()));
    return pair ? pair.slice(pair.indexOf(":") + 1) : varianteSinTalle(form.variante) ?? "";
  }
  function setVariant(color: string, talle: string) {
    const extras = parseVariante(form.variante).filter(p => !["Color", "Talle", "Variante"].includes(p.nombre));
    set("variante", [...(color.trim() ? [`Color:${color}`] : []), ...(!form.modoTalles && talle.trim() ? [`Talle:${canonizar(talle)}`] : []), ...extras.map(p => `${p.nombre}:${p.valor}`)].join(";"));
  }
  function cambiarModo(multi: boolean) {
    if (multi && !form.modoTalles && (editing || unifiedStock.current) && form.cantidadInicial > 0 && !parseTalle(form.variante)) {
      setValidation("Indicá el talle de las unidades actuales antes de pasar a varios talles. Así se conserva su stock.");
      return;
    }
    if (!multi) unifiedStock.current = true;
    setForm((f) => {
      if (!multi) return { ...f, modoTalles: false, talles: [], variante: f.talles.length === 1 ? `${f.variante};Talle:${f.talles[0].talle}` : f.variante };
      if (f.talles.length > 0) return { ...f, modoTalles: true };
      // Si la variante ya tenía talle, arranca la lista con las unidades cargadas
      // y la variante se queda con el color: el talle ahora vive en la lista.
      const talle = parseTalle(f.variante);
      if (!talle) return { ...f, modoTalles: true };
      return {
        ...f,
        modoTalles: true,
        variante: varianteSinTalle(f.variante) ?? "",
        talles: [
          { talle, cantidadInicial: f.cantidadInicial, cantidadVendida: f.cantidadVendida, sku: f.sku || null },
        ],
      };
    });
  }

  /** Completa el SKU de los talles que no tienen, sin repetir ninguno ya usado. */
  function generarSkusTalles() {
    const usados = new Set([
      ...skusEnUso,
      ...(form.talles.map((t) => t.sku).filter(Boolean) as string[]),
    ]);
    const item = { nombre: form.nombre, marcaId: form.marcaId || null };
    setTalles((ts) =>
      ts.map((t) =>
        t.sku ? t : { ...t, sku: generarSkuParaTalle(item, t.talle, { nombreDeMarca, usados }) }
      )
    );
  }

  // calcInventoryItem deriva los totales de los talles cuando los hay.
  const preview = calcInventoryItem({
    id: "preview",
    nombre: form.nombre,
    cantidadInicial: form.cantidadInicial,
    cantidadVendida: form.cantidadVendida,
    costoUnitUSD: form.costoUnitUSD,
    costoUnitARS: form.costoUnitARS,
    precioVentaARS: form.precioVentaARS,
    estado: form.estado,
    talles: form.modoTalles ? form.talles : null,
    origen: "manual",
    createdAt: "",
    updatedAt: "",
  });

  if (!open) return null;
  const photos = form.tienda.fotos.length ? form.tienda.fotos : form.imagen ? [form.imagen] : [];
  const currentBrand = nombreDeMarca[form.marcaId];
  const table = tablaDeMarca(currentBrand);
  const dirty = initialSnapshot !== "" && JSON.stringify(form) !== initialSnapshot;
  const sections = [
    { id: "product", label: "Producto", description: "Nombre, marca y color" },
    { id: "stock", label: "Talles y stock", description: "Unidades y ubicación" },
    { id: "price", label: "Costos y precio", description: "Costo, venta y margen" },
    { id: "store", label: "Fotos y tienda", description: "Ficha pública y envío" },
  ];
  const active = sections.find(s => s.id === section)!;
  const close = () => { if (saving || processingPhotos) return; pendingHref.current = null; if (dirty) setConfirmLeave(true); else onOpenChange(false); };
  function save() {
    setValidation("");
    if (!form.nombre.trim()) { setSection("product"); setValidation("Escribí el nombre del producto para guardarlo."); return; }
    if (form.modoTalles && !form.talles.length) { setSection("stock"); setValidation("Agregá al menos un talle o elegí Una variante."); return; }
    const quantities = form.modoTalles ? form.talles : [form];
    if (quantities.some(t => !Number.isInteger(t.cantidadInicial) || !Number.isInteger(t.cantidadVendida) || t.cantidadInicial < 0 || t.cantidadVendida < 0 || t.cantidadVendida > t.cantidadInicial)) { setSection("stock"); setValidation("Revisá las unidades: usá números enteros y no registres más ventas que unidades recibidas."); return; }
    if ([form.costoUnitARS, form.costoUnitUSD, form.precioVentaARS].some(n => !Number.isFinite(n) || n < 0)) { setSection("price"); setValidation("Los costos y el precio deben ser números iguales o mayores a cero."); return; }
    try { sanitizeStoreProfile(form.tienda); } catch (e) { setSection("store"); setValidation(e instanceof Error ? e.message : "Revisá la ficha de tienda."); return; }
    onSubmit();
  }
  return (
    <main aria-label={editing ? "Editar producto" : "Crear producto"} className="mx-auto w-full max-w-7xl px-4 py-6 pb-28 sm:px-6 md:pb-8">
      <div className="mb-6">
        <button type="button" onClick={close} disabled={saving || processingPhotos} className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50"><ArrowLeft className="h-4 w-4" />Volver al inventario</button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight break-words">{editing ? form.nombre || "Editar producto" : "Crear producto"}</h1><p className="mt-2 text-sm text-[var(--color-fg-muted)]">{editing ? "Editando una prenda del inventario." : "Creá la ficha de una prenda y agregá sus talles."} Guardar conserva los datos en el inventario.</p></div>
          <span role="status" className={`rounded-full px-3 py-1 text-xs font-medium ${dirty ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]"}`}>{dirty ? "Cambios sin guardar" : editing ? "Sin cambios" : "Producto nuevo"}</span>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[208px_minmax(0,1fr)_256px]">
        <nav aria-label="Secciones del producto" className="min-w-0 lg:sticky lg:top-24">
          <div role="tablist" aria-label="Editar ficha del producto" className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--color-bg-subtle)] p-1 lg:grid-cols-1">
            {sections.map((s, index) => <button key={s.id} id={`product-tab-${s.id}`} type="button" role="tab" aria-label={s.label} aria-selected={section === s.id} aria-controls={`product-panel-${s.id}`} tabIndex={section === s.id ? 0 : -1} onClick={() => setSection(s.id)} onKeyDown={e => {
              const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!delta && e.key !== "Home" && e.key !== "End") return;
              e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? sections.length - 1 : (index + delta + sections.length) % sections.length;
              setSection(sections[next].id); document.getElementById(`product-tab-${sections[next].id}`)?.focus();
            }} className={`shrink-0 rounded-lg px-3 py-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${section === s.id ? "bg-[var(--color-bg-elevated)] font-semibold text-[var(--color-fg)]" : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]"}`}><span className="block">{s.label}</span><span className="mt-1 hidden text-xs font-normal text-[var(--color-fg-muted)] lg:block">{s.description}</span></button>)}
          </div>
          <p className="mt-4 hidden px-3 text-xs leading-relaxed text-[var(--color-fg-muted)] lg:block">La publicación en Tiendanube se revisa por separado después de guardar.</p>
        </nav>
        <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 sm:p-6">
          <div className="mb-6"><h2 className="text-lg font-semibold">{active.label}</h2><p className="mt-1 text-sm text-[var(--color-fg-muted)]">{({product:"Identificá la prenda. Cada ficha puede reunir varios talles del mismo color.",stock:"Cargá las unidades recibidas y las ya vendidas por talle.",price:"Definí el costo por unidad y el precio de venta por transferencia.",store:"Prepará lo que verá el cliente y los datos necesarios para el envío."} as Record<string,string>)[section]}</p></div>
          {(validation || error) && <p id="product-editor-error" tabIndex={-1} role="alert" className="mb-6 rounded-lg bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">{validation || error}</p>}
          <fieldset disabled={saving || processingPhotos} className="min-w-0">
          <section role="tabpanel" id="product-panel-product" aria-labelledby="product-tab-product" hidden={section !== "product"} className="space-y-6">
          <Input
            label="Nombre del producto"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Ej: Remera Boxy Fit Heavyweight"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
                Marca
              </span>
              <select aria-label="Marca"
                value={form.marcaId}
                onChange={(e) => set("marcaId", e.target.value)}
                className="w-full h-9 px-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius)] text-[var(--color-fg)] cursor-pointer focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Sin marca</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              {marcas.length === 0 && (
                <span className="block text-[11px] text-[var(--color-fg-subtle)]">
                  Todavía no cargaste marcas. Se cargan desde Herramientas → Administrar marcas.
                </span>
              )}
            </label>              <Input
                label="Color"
                value={editableColor()}
                onChange={e => setVariant(e.target.value, parseTalle(form.variante) || "")}
                placeholder="Ej: Negro"
              />
          </div>
          <Input label="Referencia del proveedor" value={form.link} onChange={e => set("link", e.target.value)} placeholder="https://…" hint="Opcional. Es el enlace de origen de la prenda; queda para uso interno." />
          <Input label="Notas internas" value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Detalles para vos o tu equipo" hint="Estas notas no se envían a la tienda." />
          </section>
          <section role="tabpanel" id="product-panel-stock" aria-labelledby="product-tab-stock" hidden={section !== "stock"} className="space-y-6">
          {/* Talles: uno solo (con su variante) o varios con stock propio */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
                  Talles
                </p>
                <p className="text-[11px] text-[var(--color-fg-subtle)]">
                  {form.modoTalles
                    ? "Cada talle lleva sus propias unidades; el stock total se calcula automáticamente."
                    : "Una variante de la prenda con su stock."}
                </p>
              </div>
              <Segmented
                size="sm"
                value={form.modoTalles ? "multiples" : "unico"}
                onChange={(v) => { if (v === "unico" && form.modoTalles && form.talles.length > 1) setConfirmSingle(true); else cambiarModo(v === "multiples"); }}
                options={[
                  { value: "unico", label: "Una variante" },
                  { value: "multiples", label: "Varios talles" },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-end gap-2">
                <Input
                  label={form.modoTalles ? "SKU base" : "SKU"}
                  value={form.sku}
                  onChange={(e) => set("sku", e.target.value)}
                  placeholder="Opcional"
                />
                <Button
                  type="button"
                  variant="outline"
                  icon={<Hash className="h-3.5 w-3.5" />}
                  title="Generar a partir de la marca y el talle"
                  onClick={() =>
                    set(
                      "sku",
                      generarSku(
                        {
                          nombre: form.nombre,
                          // Con varios talles, el SKU base no lleva talle.
                          variante: form.modoTalles ? null : form.variante,
                          marcaId: form.marcaId || null,
                        },
                        { nombreDeMarca, usados: new Set(skusEnUso) }
                      )
                    )
                  }
                >
                  Generar
                </Button>
              </div>
            </div>

            {!form.modoTalles && <Input label="Talle de esta variante" value={parseTalle(form.variante) || ""} onChange={e => setVariant(editableColor(), e.target.value)} placeholder="Ej: M, XL o Único" hint="Para cargar varios talles de esta prenda, elegí Varios talles." />}
            {form.modoTalles ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {[
                    { etiqueta: "Ropa", presets: TALLES_ROPA_PRESETS },
                    { etiqueta: "Calzado", presets: TALLES_CALZADO_PRESETS },
                  ].map(({ etiqueta, presets }) => (
                    <div key={etiqueta} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-14 text-[11px] text-[var(--color-fg-subtle)]">{etiqueta}</span>
                      {presets.map((t) => {
                        const yaEsta = form.talles.some((x) => canonizar(x.talle) === t);
                        return (
                          <button
                            key={t}
                            type="button"
                            disabled={yaEsta}
                            onClick={() => agregarTalle(t)}
                            className="h-6 px-2 rounded-[var(--radius-xs)] text-[11px] font-mono font-medium border border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-colors cursor-pointer hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--color-border)] disabled:hover:text-inherit"
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label="Otro talle"
                      placeholder="Otro talle (42.5, Único…)"
                      value={nuevoTalleTxt}
                      onChange={(e) => setNuevoTalleTxt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          agregarTalle(nuevoTalleTxt);
                        }
                      }}
                      className="h-7 min-w-0 flex-1 sm:max-w-xs px-2.5 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon={<Plus className="h-3 w-3" />}
                      onClick={() => agregarTalle(nuevoTalleTxt)}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>

                {form.talles.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--color-fg-muted)] rounded-[var(--radius)] border border-dashed border-[var(--color-border)]">
                    Sumá los talles que tenés con los botones de arriba.
                  </p>
                ) : (
                  <div className="rounded-[var(--radius)] border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
                    <div className={`${GRID_TALLES} px-2 sm:px-3 py-1.5 bg-[var(--color-bg-subtle)] text-[10px] font-semibold uppercase text-[var(--color-fg-muted)]`}>
                      <span>Talle</span>
                      <span>Compr.</span>
                      <span>Vend.</span>
                      <span className="text-right">Stock</span>
                      <span className="flex items-center justify-between gap-1">
                        SKU
                        <button
                          type="button"
                          onClick={generarSkusTalles}
                          title="Generar el SKU de los talles que no tienen"
                          className="normal-case font-medium text-[var(--color-accent)] hover:underline cursor-pointer"
                        >
                          Generar
                        </button>
                      </span>
                      <span />
                    </div>
                    {form.talles.map((t, idx) => {
                      const stockTalle = Math.max(0, t.cantidadInicial - t.cantidadVendida);
                      return (
                        <div key={t.talle} className={`${GRID_TALLES} px-2 sm:px-3 py-1.5 text-xs`}>
                          <span className="font-mono font-bold text-sm text-[var(--color-fg)] truncate">
                            {t.talle}
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            aria-label={`Compradas talle ${t.talle}`}
                            value={t.cantidadInicial || ""}
                            placeholder="0"
                            onChange={(e) =>
                              actualizarTalle(idx, { cantidadInicial: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                            }
                            className={INPUT_TALLE}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            aria-label={`Vendidas talle ${t.talle}`}
                            value={t.cantidadVendida || ""}
                            placeholder="0"
                            onChange={(e) =>
                              actualizarTalle(idx, { cantidadVendida: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                            }
                            className={INPUT_TALLE}
                          />
                          <span
                            className={`text-right font-mono font-semibold ${
                              t.cantidadVendida > t.cantidadInicial
                                ? "text-[var(--color-danger)]"
                                : stockTalle > 0
                                  ? "text-[var(--color-fg)]"
                                  : "text-[var(--color-fg-subtle)]"
                            }`}
                          >
                            {stockTalle}
                          </span>
                          <input
                            type="text"
                            aria-label={`SKU talle ${t.talle}`}
                            placeholder="SKU"
                            value={t.sku || ""}
                            onChange={(e) => actualizarTalle(idx, { sku: e.target.value || null })}
                            className={`${INPUT_TALLE} font-mono text-[11px]`}
                          />
                          <button
                            type="button"
                            onClick={() => eliminarTalle(idx)}
                            aria-label={`Quitar talle ${t.talle}`}
                            title="Quitar talle"
                            className="h-7 w-7 flex items-center justify-center text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 sm:px-3 py-2 bg-[var(--color-bg-subtle)] text-[11px]">
                      <span className="text-[var(--color-fg-muted)]">
                        {form.talles.length} {form.talles.length === 1 ? "talle" : "talles"}
                      </span>
                      <span className="font-mono tnum text-[var(--color-fg-muted)]">
                        {form.cantidadInicial} compradas · {form.cantidadVendida} vendidas ·{" "}
                        <span className="font-semibold text-[var(--color-fg)]">
                          {preview.stock} en stock
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Ubicación"
              value={form.ubicacion}
              onChange={(e) => set("ubicacion", e.target.value)}
              placeholder="Estante, caja…"
            />


            <div className="sm:col-span-2 space-y-1.5">
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

          </section>
          <section role="tabpanel" id="product-panel-price" aria-labelledby="product-tab-price" hidden={section !== "price"} className="space-y-6">
          <div className="flex items-center justify-between gap-2 -mb-1">
            <span className="text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
              Costo y precio
            </span>
            {!cotizacionAbierta && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" />}
                onClick={() => setCotizacionAbierta(true)}
              >
                Traer de cotización
              </Button>
            )}
          </div>

          {cotizacionAbierta && (
            <CotizacionPrecioPicker
              nombreItem={form.nombre}
              oidItem={form.origenRef}
              onPick={traerDeCotizacion}
              onClose={() => setCotizacionAbierta(false)}
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              decimals={2}
              value={form.costoUnitUSD}
              onChange={(n) => set("costoUnitUSD", n)}
            />
            <NumberField
              label="Precio venta ARS"
              prefix="$"
              step="0.01"
              value={form.precioVentaARS}
              onChange={(n) => set("precioVentaARS", n)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2"><Input label="Descuento por transferencia (%)" type="number" min={0} max={90} value={form.tienda.descuentoPct} onChange={e => set("tienda", {...form.tienda, descuentoPct:Number(e.target.value)})} hint="Debe coincidir con el descuento configurado en Tiendanube." /><Input label="Redondear precio de lista a ($)" type="number" min={0} max={100000} step={100} value={form.tienda.redondearA} onChange={e => set("tienda", {...form.tienda, redondearA:Number(e.target.value)})} hint="Dejá 0 para conservar el precio calculado." /></div>
          <dl className="grid gap-4 rounded-lg bg-[var(--color-bg-subtle)] p-4 sm:grid-cols-2"><div><dt className="text-xs text-[var(--color-fg-muted)]">Margen por unidad, antes de publicidad y comisiones</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{fmtPct(preview.margenUnitPct)}</dd></div><div><dt className="text-xs text-[var(--color-fg-muted)]">Precio de lista para Tiendanube</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{fmtARS(precioPublicado(form.precioVentaARS, form.tienda.descuentoPct, form.tienda.redondearA))}</dd></div></dl>
          <p className="text-xs leading-relaxed text-[var(--color-fg-muted)]">El precio de lista contempla el descuento por transferencia configurado arriba. Guardar aquí no cambia los precios de Tiendanube.</p>
          </section>
          <section role="tabpanel" id="product-panel-store" aria-labelledby="product-tab-store" hidden={section !== "store"} className="space-y-6">
          <StoreProductFields
            embedded showPricing={false}
            value={form.tienda}
            productName={form.nombre}
            image={form.imagen}
            onBusyChange={setProcessingPhotos}
            onChange={(update) => setForm(f => {
              const tienda = typeof update === "function" ? update(f.tienda) : update;
              return { ...f, tienda, imagen: tienda.fotos[0] ?? "" };
            })}
          />

          <section aria-label="Descripción pública automática" className="space-y-3"><h3 className="text-base font-semibold">Descripción que verá el cliente</h3><p className="text-xs text-[var(--color-fg-muted)]">{table ? `Tabla de talles de ${table.marca} incluida.` : "Asigná una marca con tabla para incluir las medidas del proveedor."}</p><div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white p-4 text-stone-900" dangerouslySetInnerHTML={{__html: generarDescripcionTiendaHTML({...form,id:"preview",origen:"manual",createdAt:"",updatedAt:"",talles:form.modoTalles?form.talles:null}, currentBrand)}} /></section>
          </section>
          </fieldset>
        </div>
        <aside aria-label="Resumen del producto" className="hidden min-w-0 space-y-6 lg:sticky lg:top-24 lg:block">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            {photos[0] ? <img src={photos[0]} alt={form.nombre || "Portada de la prenda"} className="aspect-square w-full bg-white object-contain" referrerPolicy="no-referrer" /> : <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]"><Boxes className="h-8 w-8" strokeWidth={1.5} /><span className="text-xs">Agregá fotos en Fotos y tienda</span></div>}
            <div className="space-y-2 p-4"><p className="font-semibold break-words">{form.nombre || "Tu nuevo producto"}</p><p className="text-sm text-[var(--color-fg-muted)]">{currentBrand || "Sin marca"} · {parseColor(form.variante) || varianteSinTalle(form.variante) || "Sin color"}</p><p className="text-xl font-semibold tabular-nums">{fmtARS(form.precioVentaARS)}</p><p className="text-xs text-[var(--color-fg-muted)]">Precio por transferencia</p></div>
          </div>
          <dl className="space-y-3 px-1 text-sm"><div className="flex justify-between gap-2"><dt className="text-[var(--color-fg-muted)]">Disponibles</dt><dd className="font-semibold tabular-nums">{preview.stock} unidades</dd></div><div className="flex justify-between gap-2"><dt className="text-[var(--color-fg-muted)]">Talles</dt><dd className="text-right">{form.modoTalles ? form.talles.map(t => t.talle).join(", ") || "Sin cargar" : parseTalle(form.variante) || "Una variante"}</dd></div><div className="flex justify-between gap-2"><dt className="text-[var(--color-fg-muted)]">Tabla de talles</dt><dd className={table ? "text-[var(--color-accent)]" : "text-[var(--color-warning)]"}>{table ? "Incluida" : "Pendiente"}</dd></div></dl>
        </aside>
      </div>
      <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] md:bottom-0">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6"><span className="hidden text-xs text-[var(--color-fg-muted)] sm:block">{processingPhotos ? "Preparando fotos…" : "Se guarda en tu inventario"}</span><div className="ml-auto flex gap-2"><Button variant="outline" onClick={close} disabled={saving || processingPhotos}>Cancelar</Button><Button variant="primary" className="whitespace-nowrap" loading={saving} disabled={processingPhotos} onClick={save}>{editing ? "Guardar cambios" : "Crear producto"}</Button></div></div>
      </div>
      <ConfirmDialog open={confirmSingle} onOpenChange={setConfirmSingle} title="¿Unificar el stock en una variante?" description="Las unidades recibidas y vendidas se conservarán como totales. Al guardar, se reemplazará el desglose por talle por una sola variante." confirmText="Usar una variante" onConfirm={() => { cambiarModo(false); setConfirmSingle(false); }} />
      <ConfirmDialog open={confirmLeave} onOpenChange={next => { setConfirmLeave(next); if (!next) pendingHref.current = null; }} title="¿Descartar los cambios sin guardar?" cancelText="Seguir editando" description="Los datos que modificaste en esta ficha no se conservarán." confirmText="Descartar cambios" onConfirm={() => { const href = pendingHref.current; pendingHref.current = null; setConfirmLeave(false); onOpenChange(false); if (href) window.location.assign(href); }} />
    </main>
  );
}

function VentaDialog({
  item,
  onOpenChange,
  onConfirm,
}: {
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (it: InventoryItem, unidades: number, precioUnit: number, talleSeleccionado?: string) => void;
}) {
  const [unidades, setUnidades] = useState(1);
  const [precio, setPrecio] = useState(0);
  const [talleElegido, setTalleElegido] = useState<string>("");

  useEffect(() => {
    if (item) {
      setUnidades(1);
      setPrecio(item.precioVentaARS || 0);
      const calc = calcInventoryItem(item);
      const conStock = (calc.tallesCalc || []).filter((t) => t.stock > 0);
      setTalleElegido(conStock[0]?.talle || "");
    }
  }, [item]);

  const calc = item ? calcInventoryItem(item) : null;
  const maxDisp = calc?.tallesCalc
    ? calc.tallesCalc.find((t) => t.talle === talleElegido)?.stock ?? 0
    : calc?.stock ?? 1;

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      {item && calc && (
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar venta</DialogTitle>
            <DialogDescription>
              {item.nombre}
              {!calc.tallesCalc && item.variante ? ` · ${item.variante}` : ""} — {calc.stock} unidades disponibles
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {calc.tallesCalc && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase">
                  Talle vendido
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {calc.tallesCalc.map((t) => {
                    const disponible = t.stock > 0;
                    const seleccionado = talleElegido === t.talle;
                    return (
                      <button
                        key={t.talle}
                        type="button"
                        disabled={!disponible}
                        onClick={() => {
                          setTalleElegido(t.talle);
                          setUnidades(1);
                        }}
                        className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                          seleccionado
                            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-[var(--color-accent)] shadow-sm font-semibold"
                            : disponible
                              ? "bg-[var(--color-bg-elevated)] text-[var(--color-fg)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                              : "opacity-40 bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)] border-dashed border-[var(--color-border)] cursor-not-allowed line-through"
                        }`}
                      >
                        <span>{t.talle}</span>
                        <span className={`text-[10px] font-mono ${seleccionado ? "opacity-90" : "text-[var(--color-fg-muted)]"}`}>
                          ({t.stock} disp.)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Unidades"
                min={1}
                value={unidades}
                onChange={(n) => setUnidades(Math.max(1, Math.min(maxDisp, Math.round(n))))}
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
          </div>

          <div className="mt-2 flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              onClick={() => onConfirm(item, unidades, precio, talleElegido || undefined)}
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
