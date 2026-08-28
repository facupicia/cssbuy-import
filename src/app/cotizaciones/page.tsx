"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Calculator,
  Calendar,
  Package,
  DollarSign,
  TrendingUp,
  Eye,
  Download,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
} from "lucide-react";
import { Cotizacion } from "@/lib/types";
import { fmtUSD, fmtARS, fmtPct } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { Navbar } from "@/components/Navbar";
import { fetcher, fetcherDelete } from "@/lib/fetcher";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Fecha inválida";
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Fecha inválida";
  }
}

export default function CotizacionesPage() {
  const router = useRouter();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Cotizacion | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function fetchCotizaciones() {
    setLoading(true);
    setError(null);
    try {
      // 1. Cargar desde API
      let apiCotizaciones: Cotizacion[] = [];
      try {
        const data = await fetcher<{ cotizaciones: Cotizacion[] }>("/api/cotizaciones");
        apiCotizaciones = data.cotizaciones || [];
      } catch {
        // API fallback
      }

      // 2. Cargar desde localStorage
      let localCotizaciones: Cotizacion[] = [];
      try {
        localCotizaciones = JSON.parse(localStorage.getItem("cssbuy-cotizaciones-local") || "[]");
      } catch {}

      // 3. Merge sin duplicados por ID
      const map = new Map<string, Cotizacion>();
      for (const c of localCotizaciones) if (c?.id) map.set(c.id, c);
      for (const c of apiCotizaciones) if (c?.id) map.set(c.id, c);

      const all = Array.from(map.values()).sort(
        (a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()
      );

      setCotizaciones(all);
    } catch (err: any) {
      setError(err.message || "Error al cargar cotizaciones");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCotizaciones();
  }, []);

  async function deleteCotizacion() {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    try {
      // Eliminar de la API si es posible
      try {
        await fetcherDelete(`/api/cotizaciones/${confirmDeleteId}`);
      } catch {
        // Fallback si está solo local
      }

      // Eliminar de localStorage
      const localCotizaciones: Cotizacion[] = JSON.parse(
        localStorage.getItem("cssbuy-cotizaciones-local") || "[]"
      );
      const updated = localCotizaciones.filter((c) => c.id !== confirmDeleteId);
      localStorage.setItem("cssbuy-cotizaciones-local", JSON.stringify(updated));

      setCotizaciones((prev) => prev.filter((c) => c.id !== confirmDeleteId));
      if (selected?.id === confirmDeleteId) setSelected(null);
      toast.success("Cotización eliminada correctamente");
      setConfirmDeleteId(null);
    } catch (err: any) {
      toast.error("No se pudo eliminar", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  }

  function loadIntoCalculator(cot: Cotizacion) {
    localStorage.setItem("cssbuy-cotizacion-cargar", JSON.stringify(cot));
    toast.info("Cotización cargada. Redirigiendo a la calculadora...");
    router.push("/");
  }

  function exportJSON(cot: Cotizacion) {
    const blob = new Blob([JSON.stringify(cot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion-${cot.nombre.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Archivo JSON descargado");
  }

  const filtered = cotizaciones.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-fg)]">
              Cotizaciones Guardadas
            </h1>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Historial de cálculos de landed cost guardados en la nube y localmente
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                Nueva Cotización
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={fetchCotizaciones}
              title="Refrescar"
            />
          </div>
        </div>

        {/* Filter bar */}
        {cotizaciones.length > 0 && (
          <div className="relative max-w-md">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
            <input
              type="text"
              placeholder="Buscar cotizaciones por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius)] focus:outline-none focus:border-[var(--color-border-focus)]"
            />
          </div>
        )}

        {/* List Content */}
        {loading ? (
          <div className="p-12 flex justify-center items-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Calculator className="h-6 w-6" />}
            title={search ? "Sin resultados para tu búsqueda" : "No hay cotizaciones guardadas"}
            description={
              search
                ? "Probá con otro término de búsqueda."
                : "Creá una cotización en la calculadora y guardala para verla acá."
            }
            action={
              <Link href="/">
                <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                  Ir a la Calculadora
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((cot) => {
              const res = cot.resultados;
              const cantProductos = cot.productos?.length || 0;
              return (
                <Card
                  key={cot.id}
                  padding="none"
                  className="hover:border-[var(--color-border-focus)] transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--color-fg)] leading-snug">
                          {cot.nombre}
                        </h3>
                        <p className="text-[11px] text-[var(--color-fg-muted)] flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {formatDate(cot.fecha)}
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmDeleteId(cot.id)}
                        className="text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)] p-1 rounded transition-colors cursor-pointer"
                        title="Eliminar cotización"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] text-xs">
                      <div>
                        <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider block">
                          Costo Total
                        </span>
                        <span className="font-bold font-mono text-[var(--color-fg)]">
                          {fmtUSD(res?.costoTotalUSD || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider block">
                          Sugerido ARS
                        </span>
                        <span className="font-bold font-mono text-[var(--color-accent)]">
                          {fmtARS(res?.ingresoTotalARS || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider block">
                          Ganancia Neta
                        </span>
                        <span className="font-semibold font-mono text-[var(--color-success)]">
                          +{fmtUSD(res?.gananciaTotalUSD || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider block">
                          Productos
                        </span>
                        <span className="font-medium text-[var(--color-fg)]">
                          {cantProductos} ítems ({res?.pesoTotalG || 0}g)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--color-bg-muted)]/50 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      onClick={() => setSelected(cot)}
                    >
                      Ver Detalle
                    </Button>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Download className="h-3.5 w-3.5" />}
                        onClick={() => exportJSON(cot)}
                        title="Descargar JSON"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Calculator className="h-3.5 w-3.5" />}
                        onClick={() => loadIntoCalculator(cot)}
                      >
                        Cargar
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal de Detalle */}
        <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
          {selected && (
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{selected.nombre}</DialogTitle>
                <DialogDescription>
                  Guardada el {formatDate(selected.fecha)} • FX: Blue ${selected.fx.blue} / CNY {selected.fx.cny}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Resumen */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--color-fg-muted)] uppercase">Costo Paquete</span>
                    <p className="font-bold font-mono text-sm">{fmtUSD(selected.resultados?.costoTotalUSD || 0)}</p>
                    <p className="text-[10px] text-[var(--color-fg-muted)] font-mono">{fmtARS(selected.resultados?.costoTotalARS || 0)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-fg-muted)] uppercase">Venta Sugerida</span>
                    <p className="font-bold font-mono text-sm text-[var(--color-accent)]">{fmtARS(selected.resultados?.ingresoTotalARS || 0)}</p>
                    <p className="text-[10px] text-[var(--color-fg-muted)] font-mono">{fmtUSD(selected.resultados?.ingresoTotalUSD || 0)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-fg-muted)] uppercase">Ganancia Neta</span>
                    <p className="font-bold font-mono text-sm text-[var(--color-success)]">+{fmtUSD(selected.resultados?.gananciaTotalUSD || 0)}</p>
                    <p className="text-[10px] text-[var(--color-fg-muted)] font-mono">Margen: {fmtPct(selected.resultados?.margenTotalPct || 0)}</p>
                  </div>
                </div>

                {/* Tabla de Productos */}
                <div className="border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[var(--color-fg-muted)] uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Producto</th>
                        <th className="py-2 px-3 text-center">Cant.</th>
                        <th className="py-2 px-3 text-right">Precio CNY</th>
                        <th className="py-2 px-3 text-right">Peso</th>
                        <th className="py-2 px-3 text-right">Costo USD</th>
                        <th className="py-2 px-3 text-right">Markup</th>
                        <th className="py-2 px-3 text-right">Precio ARS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {selected.productos.map((p, idx) => {
                        const itemCalc = selected.resultados?.productosCalc?.[idx];
                        const itemMarkup = itemCalc?.markup || p.markup || selected.envio?.markup || 2;
                        return (
                          <tr key={idx}>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                {p.imgURL && <img src={p.imgURL} alt="" className="w-6 h-6 rounded object-cover" />}
                                <span className="font-medium truncate max-w-[200px]">{p.nombre || "Sin nombre"}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">{p.cantidad}</td>
                            <td className="py-2 px-3 text-right font-mono">¥{p.precioCNY}</td>
                            <td className="py-2 px-3 text-right font-mono">{p.pesoG}g</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold">
                              {fmtUSD(itemCalc?.costoUnitUSD || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-medium">
                              {itemMarkup.toFixed(1)}x
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-[var(--color-accent)]">
                              {fmtARS(itemCalc?.ventaUnitARS || 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Cerrar
                </Button>
                <Button
                  variant="primary"
                  icon={<Calculator className="h-3.5 w-3.5" />}
                  onClick={() => loadIntoCalculator(selected)}
                >
                  Cargar en Calculadora
                </Button>
              </div>
            </DialogContent>
          )}
        </Dialog>

        {/* Dialog de confirmación de eliminación */}
        <ConfirmDialog
          open={Boolean(confirmDeleteId)}
          onOpenChange={(open) => !open && setConfirmDeleteId(null)}
          title="¿Eliminar cotización?"
          description="Esta acción eliminará la cotización guardada permanentemente."
          confirmText="Eliminar"
          loading={Boolean(deletingId)}
          onConfirm={deleteCotizacion}
        />
      </main>
    </div>
  );
}
