"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  FileText,
  Receipt,
  Boxes,
  Terminal,
  Moon,
  Sun,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel } from "./ui/Menu";
import { cn } from "@/lib/cn";
import { useState, useEffect } from "react";

const links = [
  { href: "/", label: "Calculadora", icon: Calculator },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/records", label: "Balance", icon: Receipt },
];

export function Navbar({
  onOpenWarehouseScraper,
  onOpenRecordScraper,
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
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("cssbuy-theme");
    const prefiereOscuro =
      stored === "dark" || (stored === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(prefiereOscuro);
    document.documentElement.classList.toggle("dark", prefiereOscuro);
  }, []);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cssbuy-theme", next ? "dark" : "light");
    } catch {
      // modo privado: el tema simplemente no persiste
    }
  };

  const tieneAcciones = Boolean(onSyncCssbuy || onOpenWarehouseScraper || onOpenRecordScraper);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          {/* Marca */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--color-fg)] text-[var(--color-bg)] flex items-center justify-center font-bold text-sm tracking-tight shadow-sm group-hover:scale-105 transition-transform">
              PL
            </div>
            <div className="hidden sm:block">
              <span className="block font-bold text-sm tracking-tight text-[var(--color-fg)] leading-tight">
                CSSBuy Calculator
              </span>
              <span className="block text-[11px] text-[var(--color-fg-muted)] leading-tight">
                Landed cost & cotizador
              </span>
            </div>
          </Link>

          {/* Navegación (desktop) */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors",
                    active
                      ? "bg-[var(--color-bg-muted)] text-[var(--color-fg)] font-semibold"
                      : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Acciones */}
          <div className="flex items-center gap-2 shrink-0">
            {onSyncCssbuy && (
              <Button
                variant="outline"
                size="sm"
                disabled={syncingCssbuy}
                className="hidden lg:inline-flex"
                icon={
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5 text-[var(--color-success)]",
                      syncingCssbuy && "animate-spin"
                    )}
                  />
                }
                onClick={onSyncCssbuy}
                title="Sincroniza tus órdenes de CSSBuy a la base de datos"
              >
                {syncingCssbuy ? "Sincronizando…" : "Sync"}
              </Button>
            )}

            {tieneAcciones && (
              <Menu>
                <MenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<MoreHorizontal className="h-4 w-4" />}
                    title="Herramientas de CSSBuy"
                    aria-label="Herramientas de CSSBuy"
                  />
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>CSSBuy</MenuLabel>
                  {onSyncCssbuy && (
                    <MenuItem
                      icon={
                        <RefreshCw
                          className={cn("h-3.5 w-3.5", syncingCssbuy && "animate-spin")}
                        />
                      }
                      disabled={syncingCssbuy}
                      onSelect={onSyncCssbuy}
                    >
                      {syncingCssbuy ? "Sincronizando…" : "Sincronizar órdenes"}
                    </MenuItem>
                  )}
                  {onOpenWarehouseScraper && (
                    <MenuItem
                      icon={<Terminal className="h-3.5 w-3.5" />}
                      onSelect={onOpenWarehouseScraper}
                    >
                      Scraper de órdenes
                    </MenuItem>
                  )}
                  {onOpenRecordScraper && (
                    <MenuItem
                      icon={<Terminal className="h-3.5 w-3.5" />}
                      onSelect={onOpenRecordScraper}
                    >
                      Scraper de movimientos
                    </MenuItem>
                  )}
                </MenuContent>
              </Menu>
            )}

            <button
              onClick={toggleDarkMode}
              className="w-8 h-8 rounded-[var(--radius)] flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              aria-label="Cambiar tema"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Navegación inferior en mobile: alcanzable con el pulgar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur-md">
        <div className="grid grid-cols-4">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-fg-muted)] active:text-[var(--color-fg)]"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
