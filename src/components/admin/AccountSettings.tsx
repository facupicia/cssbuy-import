"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { accountRequest, type AccountStatus } from "@/lib/auth-client";

export function AccountSettings({ user, disabled = false }: { user: NonNullable<AccountStatus["user"]>; disabled?: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setBusy] = useState(false);
  const busy = working || disabled;
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function act(action: "logout" | "others" | "password") {
    setNotice(""); setError("");
    if (action === "password" && newPassword !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      await accountRequest(action === "logout" ? "/api/admin/session" : action === "others" ? "/api/auth/revoke-other-sessions" : "/api/auth/change-password",
        action === "password" ? { currentPassword, newPassword, revokeOtherSessions: true } : {}, action === "logout" ? "DELETE" : "POST");
      if (action === "logout") { window.location.replace("/ingresar"); return; }
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      setNotice(action === "others" ? "Se cerraron las sesiones de tus otros dispositivos." : "Contraseña actualizada. Se cerraron las sesiones de tus otros dispositivos.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="account-title" className="space-y-6 rounded-xl border border-[var(--color-border)] p-4 sm:p-6">
    <div className="space-y-2"><h2 id="account-title" className="text-xl font-semibold">Tu cuenta</h2><p className="text-sm font-semibold">{user.name}</p><p className="break-all text-sm text-[var(--color-fg-muted)]">{user.email} · Administrador</p><p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">Tu sesión sirve en todo el panel. Si elegiste mantenerla iniciada, se renueva al usarlo y vence después de 30 días sin actividad.</p></div>
    {error && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] p-4 text-sm text-[var(--color-accent)]">{notice}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => void act("logout")}>Cerrar sesión</Button><Button variant="outline" disabled={busy} onClick={() => void act("others")}>Cerrar sesiones en otros dispositivos</Button></div>
    <details className="max-w-lg space-y-4"><summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Cambiar mi contraseña</summary>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void act("password"); }}>
        <input type="text" autoComplete="username" value={user.email} readOnly hidden />
        <Input label="Contraseña actual" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} disabled={busy} />
        <Input label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="Al menos 12 caracteres." value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={busy} />
        <Input label="Repetí la nueva contraseña" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</Button>
      </form>
    </details>
  </section>;
}
