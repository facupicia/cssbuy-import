"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
export function CalculatorNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Secciones de Calculadora" className="flex flex-wrap gap-2">{[{ href: "/", label: "Calculadora" }, { href: "/calculadora/proveedores", label: "Mis proveedores" }].map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2", pathname === link.href ? "bg-[var(--color-fg)] text-[var(--color-bg)]" : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]")}>{link.label}</Link>)}</nav>;
}
