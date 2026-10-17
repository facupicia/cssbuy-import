"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StoreConnectionSettings } from "@/components/inventario/StoreConnectionSettings";
import { adminReturnPath } from "@/lib/admin-navigation";

type Session = { authenticated: boolean; adminConfigured: boolean };
export default function SettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/session", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo comprobar el acceso. Reintentá.");
    setSession(data);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(adminReturnPath(params.get("volver")));
    const result = params.get("tiendanube");
    if (result === "connected") setNotice("Tiendanube conectada. Ya podés publicar productos o editar el catálogo.");
    if (result === "cancelled") setNotice("La autorización fue cancelada. Podés retomarla en Conexión de Tiendanube.");
    if (result === "failed") setError("No se pudo autorizar Tiendanube. Revisá la aplicación y los permisos de productos antes de reintentar.");
    void refresh().catch(e => setError(e.message));
  }, [refresh]);
  async function access(method: "POST" | "DELETE") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/session", { method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cambiar el acceso. Reintentá.");
      setPassword(""); await refresh();
      if (method === "POST" && returnTo) router.push(returnTo);
      else setNotice(method === "POST" ? "Acceso de administración habilitado por una hora." : "Acceso cerrado para todas las funcionalidades de este navegador.");
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo cambiar el acceso."); }
    finally { setBusy(false); }
  }
  return <><Navbar /><main className="mx-auto max-w-5xl space-y-8 px-4 py-8 pb-24 sm:px-6">
    <header className="space-y-2"><h1 className="text-3xl font-semibold">Configuración</h1><p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Gestioná el acceso al centro de comando y la conexión con tu tienda.</p></header>
    {error && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] p-4 text-sm text-[var(--color-accent)]">{notice}</p>}
    <section aria-labelledby="admin-title" className="grid gap-6 rounded-xl border border-[var(--color-border)] p-4 sm:p-6 md:grid-cols-2">
      <div className="space-y-3"><h2 id="admin-title" className="text-xl font-semibold">Acceso de administración</h2><p className="text-sm text-[var(--color-fg-muted)]">Ingresás una vez y el acceso sirve en todo el panel.</p><ul className="list-disc space-y-2 pl-4 text-sm text-[var(--color-fg-muted)]"><li>Agenda de vendedores y fábricas</li><li>Publicación y edición del catálogo de Tiendanube</li><li>Personalización de la tienda</li><li>Sincronización con CSSBuy</li><li>Reportes de publicidad y rentabilidad</li></ul></div>
      <div className="space-y-4">
        {!session ? <><p role="status" className="text-sm">Comprobando acceso…</p>{error && <Button disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}>Reintentar</Button>}</>
          : session.authenticated ? <><p className="text-sm font-semibold text-[var(--color-accent)]">Sesión de administración activa</p><p className="text-sm text-[var(--color-fg-muted)]">Se cierra automáticamente al cumplirse una hora desde el ingreso. Cerrar el acceso afecta a todas las funciones privadas de este navegador.</p><div className="flex flex-wrap items-center gap-4"><Button variant="outline" disabled={busy} onClick={() => void access("DELETE")}>Cerrar acceso de administración</Button>{returnTo && <Link href={returnTo} className="text-sm underline underline-offset-4">Volver a mi tarea</Link>}</div></>
          : !session.adminConfigured ? <p role="alert" className="text-sm">Falta configurar la contraseña de administración en el servidor. Debe tener al menos 12 caracteres.</p>
          : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void access("POST"); }}><Input label="Contraseña de administración" type="password" autoComplete="current-password" required maxLength={512} disabled={busy} value={password} onChange={e => setPassword(e.target.value)} hint="Usá la contraseña de administración que ya tenés configurada." /><Button variant="primary" type="submit" disabled={busy || !password}>{busy ? "Ingresando…" : returnTo ? "Ingresar y volver a mi tarea" : "Habilitar acceso"}</Button></form>}
      </div>
    </section>
    <section id="tiendanube" className="scroll-mt-24 space-y-4"><h2 className="text-xl font-semibold">Conexión de Tiendanube</h2><p className="text-sm text-[var(--color-fg-muted)]">Vinculá o verificá la tienda que usás para publicar y administrar productos.</p>
      {session?.authenticated ? <StoreConnectionSettings onChanged={refresh} onBusyChange={setBusy} /> : <p className="rounded-lg bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-fg-muted)]">Ingresá arriba para gestionar la conexión.</p>}
      {session?.authenticated && <div className="flex flex-wrap gap-4 text-sm"><Link className="underline underline-offset-4" href="/tiendanube/publicar">Ir a publicar productos</Link><Link className="underline underline-offset-4" href="/tiendanube/catalogo">Ir a editar el catálogo</Link></div>}
    </section>
  </main></>;
}
