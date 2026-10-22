"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { accountRequest, type AccountStatus } from "@/lib/auth-client";
import { adminReturnPath } from "@/lib/admin-navigation";

function destination() {
  return adminReturnPath(new URLSearchParams(window.location.search).get("volver")) || "/";
}

export function AccountLogin() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const applyStatus = useCallback((next: AccountStatus) => {
    setError(""); setStatus(next);
    if (next.authenticated) window.location.replace(destination());
  }, []);
  async function refresh() {
    try { applyStatus(await accountRequest<AccountStatus>("/api/admin/session", undefined, "GET")); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => {
    let active = true;
    void accountRequest<AccountStatus>("/api/admin/session", undefined, "GET")
      .then(next => { if (active) applyStatus(next); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [applyStatus]);

  async function submit() {
    setError("");
    if (status?.setupRequired && password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      await accountRequest(status?.setupRequired ? "/api/admin/bootstrap" : "/api/auth/sign-in/email", {
        email: email.trim().toLowerCase(), password, rememberMe,
        ...(status?.setupRequired ? { name: name.trim(), adminPassword } : {}),
      });
      setPassword(""); setConfirmation(""); setAdminPassword("");
      window.location.replace(destination());
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return <main id="contenido" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-4 py-8 sm:px-6">
    <a href="#formulario" className="sr-only focus:not-sr-only">Ir al formulario</a>
    <header className="space-y-3">
      <p className="text-sm font-semibold tracking-wide">PLUG · Panel de gestión</p>
      <h1 className="text-balance text-3xl font-semibold">{status?.setupRequired ? "Creá tu cuenta" : "Ingresá a tu panel"}</h1>
      <p className="text-pretty text-sm text-[var(--color-fg-muted)]">{status?.setupRequired
        ? "Configurá tu usuario una sola vez. La clave de administración actual te permite crear la primera cuenta."
        : "Tus costos, inventario y tienda, con un solo ingreso."}</p>
    </header>
    <section id="formulario" aria-label="Acceso a PLUG" aria-busy={busy} className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
      {error && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
      {!status ? <><div role="status" className="space-y-4"><p className="text-sm">Comprobando acceso…</p><div className="h-10 animate-pulse rounded-lg bg-[var(--color-bg-subtle)] motion-reduce:animate-none" /></div>{error && <Button onClick={() => void refresh()}>Reintentar</Button>}</>
        : !status.adminConfigured ? <p role="alert" className="text-sm">El acceso necesita configuración en el servidor. Revisá PostgreSQL y los secretos del panel.</p>
        : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
          {status.setupRequired && <Input label="Tu nombre" autoComplete="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={busy} />}
          <Input label="Email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          <Input label={status.setupRequired ? "Tu nueva contraseña" : "Contraseña"} type="password" autoComplete={status.setupRequired ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} hint={status.setupRequired ? "Al menos 12 caracteres. Elegí una diferente de la clave de administración." : undefined} />
          {status.setupRequired && <>
            <Input label="Repetí tu nueva contraseña" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
            <Input label="Clave de administración actual" type="password" autoComplete="off" required maxLength={512} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} disabled={busy} hint="Solo se usa para crear esta primera cuenta." />
          </>}
          <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm"><input className="mt-1 h-4 w-4 accent-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2" type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} disabled={busy} /><span>Mantener sesión iniciada<span className="mt-1 block text-xs text-[var(--color-fg-muted)]">Hasta 30 días, renovables al usar el panel. Activá esta opción en tus dispositivos personales.</span></span></label>
          <Button className="w-full focus-visible:outline-2 focus-visible:outline-offset-2" variant="primary" type="submit" disabled={busy}>{busy ? "Ingresando…" : status.setupRequired ? "Crear mi cuenta e ingresar" : "Ingresar"}</Button>
        </form>}
    </section>
  </main>;
}
