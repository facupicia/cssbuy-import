import Link from "next/link";

export function AdminAccessNotice({ returnTo }: { returnTo: string }) {
  return <section className="space-y-3 rounded-xl border border-[var(--color-border)] p-4 sm:p-6">
    <h2 className="text-lg font-semibold">Iniciá sesión con tu cuenta</h2>
    <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Tu cuenta te permite usar todas las funciones del panel. Podés mantener la sesión iniciada en tus dispositivos.</p>
    <Link href={`/ingresar?volver=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-10 items-center rounded-lg bg-[var(--color-fg)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2">Iniciar sesión</Link>
  </section>;
}
