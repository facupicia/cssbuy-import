import Link from "next/link";

export function AdminAccessNotice({ returnTo }: { returnTo: string }) {
  return <section className="space-y-3 rounded-xl border border-[var(--color-border)] p-4 sm:p-6">
    <h2 className="text-lg font-semibold">Ingresá desde Configuración</h2>
    <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Un solo acceso de administración para tu agenda de proveedores, Tiendanube, CSSBuy y publicidad. La sesión dura una hora.</p>
    <Link href={`/configuracion?volver=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-10 items-center rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2">Abrir acceso de administración</Link>
  </section>;
}
