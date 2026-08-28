"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Receipt,
  Upload,
  Search,
  ArrowUpDown,
  Filter,
  DollarSign,
  TrendingDown,
  ShoppingBag,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  CssbuyTransaction,
  CssbuyRecordGroup,
  RecordSummary,
} from "@/lib/types";
import {
  parseRecords,
  groupRecordsByOrder,
  summarizeRecords,
  calculateRealItemCost,
} from "@/lib/cssbuy-records";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { Navbar } from "@/components/Navbar";
import { RecordScraperModal } from "@/components/RecordScraperModal";

export default function RecordsPage() {
  const [records, setRecords] = useState<CssbuyTransaction[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const parsed = JSON.parse(localStorage.getItem("cssbuy-records") || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRecords(parsed);
      }
    } catch {}
  }, []);

  const [search, setSearch] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [scraperOpen, setScraperOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const list = Array.isArray(json) ? json : json.records || [];
        const parsed = parseRecords(list);
        setRecords(parsed);
        localStorage.setItem("cssbuy-records", JSON.stringify(parsed));
        toast.success(`Cargados ${parsed.length} movimientos de CSSBuy`);
      } catch (err: any) {
        toast.error("Error al leer el archivo JSON", { description: err.message });
      }
    };
    reader.readAsText(file);
  };

  const summary = useMemo(() => summarizeRecords(records), [records]);
  const groups = useMemo(() => groupRecordsByOrder(records), [records]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.orderId.toLowerCase().includes(q) ||
        (g.productName && g.productName.toLowerCase().includes(q))
    );
  }, [groups, search]);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <Navbar onOpenRecordScraper={() => setScraperOpen(true)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-fg)]">
              CSSBuy Balance Records
            </h1>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Análisis y desglose de movimientos de dinero: compras, fotos, flete interno y recargas
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Cargar records.json
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setScraperOpen(true)}
            >
              Obtener Scraper
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        {records.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card padding="sm" className="space-y-1">
              <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider">
                Total Movimientos
              </span>
              <p className="text-xl font-bold font-mono text-[var(--color-fg)]">
                {summary.totalRecords}
              </p>
              <p className="text-[10px] text-[var(--color-fg-subtle)]">
                {summary.groupCount} órdenes agrupadas
              </p>
            </Card>

            <Card padding="sm" className="space-y-1">
              <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider">
                Total Gastado
              </span>
              <p className="text-xl font-bold font-mono text-[var(--color-danger)]">
                ¥{summary.totalSpent.toFixed(2)}
              </p>
              <p className="text-[10px] text-[var(--color-fg-subtle)]">
                Compras + servicios + flete
              </p>
            </Card>

            <Card padding="sm" className="space-y-1">
              <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider">
                Total Recargado
              </span>
              <p className="text-xl font-bold font-mono text-[var(--color-success)]">
                ¥{summary.totalRecharged.toFixed(2)}
              </p>
              <p className="text-[10px] text-[var(--color-fg-subtle)]">
                Ingresos a la cuenta
              </p>
            </Card>

            <Card padding="sm" className="space-y-1">
              <span className="text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider">
                Saldo Teórico
              </span>
              <p className="text-xl font-bold font-mono text-[var(--color-info)]">
                ¥{(summary.totalRecharged - summary.totalSpent).toFixed(2)}
              </p>
              <p className="text-[10px] text-[var(--color-fg-subtle)]">
                Diferencial acumulado
              </p>
            </Card>
          </div>
        )}

        {/* Content */}
        {records.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="No hay balance records cargados"
            description="Ejecutá el script de Balance Records en cssbuy.com/web/record para descargar tu archivo records.json y visualizar el costo real desglosado por pedido."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Upload className="h-3.5 w-3.5" />}
                onClick={() => fileInputRef.current?.click()}
              >
                Subir records.json
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              <input
                type="text"
                placeholder="Buscar por Order ID o nombre de producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius)] focus:outline-none focus:border-[var(--color-border-focus)]"
              />
            </div>

            {/* Groups list */}
            <div className="space-y-3">
              {filteredGroups.map((group) => {
                const isExpanded = Boolean(expandedOrders[group.orderId]);
                const realCost = calculateRealItemCost(group);

                return (
                  <Card key={group.orderId} padding="none" className="overflow-hidden">
                    <button
                      onClick={() => toggleExpand(group.orderId)}
                      className="w-full p-3.5 flex items-center justify-between gap-4 text-left hover:bg-[var(--color-bg-subtle)]/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-[var(--color-fg-muted)]">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-[var(--color-fg)]">
                              #{group.orderId}
                            </span>
                            {group.quantity && (
                              <Badge variant="outline" size="sm">
                                {group.quantity} u.
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-[var(--color-fg-muted)] truncate max-w-md mt-0.5">
                            {group.productName || "Producto sin nombre identificado"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right flex-shrink-0">
                        <div>
                          <span className="text-[10px] text-[var(--color-fg-muted)] uppercase block">
                            Costo Landed China
                          </span>
                          <span className="font-bold font-mono text-sm text-[var(--color-fg)]">
                            ¥{realCost.toFixed(2)}
                          </span>
                        </div>
                        <Badge variant="default">
                          {group.transactions.length} movs
                        </Badge>
                      </div>
                    </button>

                    {/* Detailed transaction list */}
                    {isExpanded && (
                      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]/40 p-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                          <div className="p-2 bg-[var(--color-bg-elevated)] rounded border border-[var(--color-border)]">
                            <span className="text-[10px] text-[var(--color-fg-muted)]">Item:</span>{" "}
                            <span className="font-mono font-semibold">¥{Math.abs(group.buyItemTotal).toFixed(2)}</span>
                          </div>
                          <div className="p-2 bg-[var(--color-bg-elevated)] rounded border border-[var(--color-border)]">
                            <span className="text-[10px] text-[var(--color-fg-muted)]">Servicios/Fotos:</span>{" "}
                            <span className="font-mono font-semibold">¥{Math.abs(group.serviceFeeTotal).toFixed(2)}</span>
                          </div>
                          <div className="p-2 bg-[var(--color-bg-elevated)] rounded border border-[var(--color-border)]">
                            <span className="text-[10px] text-[var(--color-fg-muted)]">Flete Local:</span>{" "}
                            <span className="font-mono font-semibold">¥{Math.abs(group.domesticShippingTotal).toFixed(2)}</span>
                          </div>
                          <div className="p-2 bg-[var(--color-bg-elevated)] rounded border border-[var(--color-border)]">
                            <span className="text-[10px] text-[var(--color-fg-muted)]">Ajustes:</span>{" "}
                            <span className="font-mono font-semibold">¥{Math.abs(group.adjustPriceTotal).toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-[var(--radius)] bg-[var(--color-bg-elevated)] overflow-hidden">
                          {group.transactions.map((tx, idx) => (
                            <div key={idx} className="p-2.5 flex items-center justify-between text-xs gap-2">
                              <div className="min-w-0">
                                <span className="font-semibold text-[var(--color-fg)]">
                                  {tx.action}
                                </span>
                                <p className="text-[11px] text-[var(--color-fg-muted)] truncate mt-0.5 max-w-lg">
                                  {tx.remark}
                                </p>
                              </div>
                              <span className="font-mono font-bold text-xs text-[var(--color-danger)] flex-shrink-0">
                                ¥{tx.money}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <RecordScraperModal open={scraperOpen} onOpenChange={setScraperOpen} />
    </div>
  );
}
