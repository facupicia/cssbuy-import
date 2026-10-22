"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { AccountSettings } from "@/components/admin/AccountSettings";
import { accountRequest, type AccountStatus } from "@/lib/auth-client";
import { StoreConnectionSettings } from "@/components/inventario/StoreConnectionSettings";
import { adminReturnPath } from "@/lib/admin-navigation";

type Session = AccountStatus;
export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const applyStatus = useCallback((data: AccountStatus) => {
    setSession(data);
    setError("");
    const params = new URLSearchParams(window.location.search);
    setReturnTo(adminReturnPath(params.get("volver")));
    const result = params.get("tiendanube");
    if (result === "connected") setNotice("Tiendanube conectada. Ya podés publicar productos o editar el catálogo.");
    if (result === "cancelled") setNotice("La autorización fue cancelada. Podés retomarla en Conexión de Tiendanube.");
    if (result === "failed") setError("No se pudo autorizar Tiendanube. Revisá la aplicación y los permisos de productos antes de reintentar.");
  }, []);
  const refresh = useCallback(() => accountRequest<AccountStatus>("/api/admin/session", undefined, "GET").then(applyStatus), [applyStatus]);
  useEffect(() => {
    let active = true;
    void accountRequest<AccountStatus>("/api/admin/session", undefined, "GET")
      .then(data => { if (active) applyStatus(data); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [applyStatus]);
  return <><Navbar /><main className="mx-auto max-w-5xl space-y-8 px-4 py-8 pb-24 sm:px-6">
    <header className="space-y-2"><h1 className="text-3xl font-semibold">Configuración</h1><p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Gestioná el acceso al centro de comando y la conexión con tu tienda.</p></header>
    {error && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] p-4 text-sm text-[var(--color-accent)]">{notice}</p>}
    {session?.authenticated && session.user ? <AccountSettings user={session.user} disabled={busy} />
      : <div role="status" className="space-y-4 rounded-xl border border-[var(--color-border)] p-6"><p className="text-sm">{error ? "No se pudo comprobar tu cuenta." : "Comprobando tu cuenta…"}</p><Button onClick={() => void refresh().catch(e => setError(e.message))}>Reintentar</Button><Link className="ml-4 text-sm underline" href="/ingresar?volver=%2Fconfiguracion">Iniciar sesión</Link></div>}
    {returnTo && <Link href={returnTo} className="inline-block text-sm underline underline-offset-4">Volver a mi tarea</Link>}
    <section id="tiendanube" className="scroll-mt-24 space-y-4"><h2 className="text-xl font-semibold">Conexión de Tiendanube</h2><p className="text-sm text-[var(--color-fg-muted)]">Vinculá o verificá la tienda que usás para publicar y administrar productos.</p>
      {session?.authenticated ? <StoreConnectionSettings onChanged={refresh} onBusyChange={setBusy} /> : <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-fg-muted)]">Ingresá arriba para gestionar la conexión.</p>}
      {session?.authenticated && <div className="flex flex-wrap gap-4 text-sm"><Link className="underline underline-offset-4" href="/tiendanube/publicar">Ir a publicar productos</Link><Link className="underline underline-offset-4" href="/tiendanube/catalogo">Ir a editar el catálogo</Link></div>}
    </section>
  </main></>;
}
