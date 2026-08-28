"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, FileText, Receipt, Terminal, Upload, Download, Moon, Sun, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "./ui/Button";
import { cn } from "@/lib/cn";
import { useState, useEffect } from "react";

export function Navbar({
  onOpenWarehouseScraper,
  onOpenRecordScraper,
  onExportJson,
  onImportJson,
  onSyncCssbuy,
  syncingCssbuy,
}: {
  onOpenWarehouseScraper?: () => void;
  onOpenRecordScraper?: () => void;
  onExportJson?: () => void;
  onImportJson?: () => void;
  onSyncCssbuy?: () => void;
  syncingCssbuy?: boolean;
}) {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDarkMode = document.documentElement.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(isDarkMode);
      if (isDarkMode) document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const links = [
    { href: "/", label: "Calculadora", icon: Calculator },
    { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
    { href: "/records", label: "Balance Records", icon: Receipt },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand & Tabs */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--color-fg)] text-[var(--color-bg)] flex items-center justify-center font-bold text-sm tracking-tight shadow-sm group-hover:scale-105 transition-transform">
              PL
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-[var(--color-fg)]">
                  CSSBuy Calculator
                </span>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  Pro
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-fg-muted)] leading-none">
                Landed Cost & Cotizador
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-4 border-l border-[var(--color-border)] pl-4">
            {links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors",
                    active
                      ? "bg-[var(--color-bg-muted)] text-[var(--color-fg)] font-semibold shadow-xs"
                      : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onSyncCssbuy && (
            <Button
              variant="outline"
              size="sm"
              disabled={syncingCssbuy}
              icon={<RefreshCw className={cn("h-3.5 w-3.5 text-[var(--color-success)]", syncingCssbuy && "animate-spin")} />}
              onClick={onSyncCssbuy}
              title="Sincroniza tus órdenes de CSSBuy a tu base de datos Postgres"
            >
              {syncingCssbuy ? "Sincronizando..." : "Sync CSSBuy"}
            </Button>
          )}

          {onOpenWarehouseScraper && (
            <Button
              variant="outline"
              size="sm"
              icon={<Terminal className="h-3.5 w-3.5 text-[var(--color-accent)]" />}
              onClick={onOpenWarehouseScraper}
              title="Scraper de órdenes y pedidos de CSSBuy (Nuevas, En Almacén, etc.)"
            >
              <span className="hidden sm:inline">Scraper</span> Órdenes
            </Button>
          )}

          {onOpenRecordScraper && (
            <Button
              variant="outline"
              size="sm"
              icon={<Terminal className="h-3.5 w-3.5 text-[var(--color-info)]" />}
              onClick={onOpenRecordScraper}
              title="Scraper de movimientos de dinero de CSSBuy"
            >
              <span className="hidden sm:inline">Scraper</span> Records
            </Button>
          )}

          <button
            onClick={toggleDarkMode}
            className="w-8 h-8 rounded-[var(--radius)] flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)] border border-[var(--color-border)] transition-colors cursor-pointer"
            title="Cambiar tema"
            aria-label="Cambiar tema"
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex items-center justify-around border-t border-[var(--color-border)] px-2 py-1.5 bg-[var(--color-bg)]">
        {links.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)]",
                active
                  ? "bg-[var(--color-bg-muted)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-muted)]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
