"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const links = [
  { href: "/tiendanube/publicar", label: "Publicar productos" },
  { href: "/tiendanube/catalogo", label: "Editar catálogo" },
  { href: "/tienda", label: "Personalizar tienda" },
];
export function StoreNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Secciones de Tiendanube" className="flex flex-wrap gap-2">
    {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2", pathname === link.href ? "bg-[var(--color-fg)] text-[var(--color-bg)]" : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]")}>{link.label}</Link>)}
    <Link href="/configuracion#tiendanube" className="inline-flex min-h-10 items-center px-3 py-2 text-sm text-[var(--color-fg-muted)] underline underline-offset-4 hover:text-[var(--color-fg)]">Conexión y acceso</Link>
  </nav>;
}
