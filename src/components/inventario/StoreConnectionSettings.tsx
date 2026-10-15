"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Settings = {
  connection: { storeId: string; storeName: string; source: "panel" | "environment"; verifiedAt: string | null } | null;
  app: { clientId: string; shopUrl: string; contactEmail: string } | null;
  callbackUrl: string;
  warning?: string;
};
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la conexión");
  return data;
}
export function StoreConnectionSettings({ onChanged, onBusyChange }: { onChanged: () => Promise<void>; onBusyChange: (value: boolean) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  const [shopUrl, setShopUrl] = useState("https://plugrosario.xyz");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [disconnect, setDisconnect] = useState(false);
  const load = useCallback(async () => {
    const data = await api<Settings>("/api/tiendanube/connection"); setSettings(data);
    if (data.app) { setClientId(data.app.clientId); setEmail(data.app.contactEmail); setShopUrl(data.app.shopUrl); }
  }, []);
  useEffect(() => { let disposed = false; load().catch(e => { if (!disposed) setError(e.message); }).finally(() => { if (!disposed) setLoading(false); }); return () => { disposed = true; }; }, [load]);
  async function act(action: () => Promise<void>) {
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try { await action(); }
    catch(e) { setError(e instanceof Error ? e.message : "No se pudo completar la operación"); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="space-y-4 rounded-lg border border-[var(--color-border)] p-4" aria-label="Conexión con Tiendanube">
    <div><h3 className="text-base font-semibold">Conexión con Tiendanube</h3><p className="text-sm text-[var(--color-fg-muted)]">Autorizá tu tienda para cargar y actualizar productos desde este panel.</p></div>
    {loading && <p role="status" className="text-sm">Cargando configuración…</p>}
    {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
    {settings?.warning && <p role="alert" className="text-sm text-[var(--color-warning)]">{settings.warning}</p>}
    {message && <p role="status" className="text-sm text-[var(--color-accent)]">{message}</p>}
    {settings?.connection && <div className="space-y-3">
      <p className="text-sm"><strong>{settings.connection.storeName}</strong> · Tienda #{settings.connection.storeId}</p>
      <p className="text-xs text-[var(--color-fg-muted)]">{settings.connection.verifiedAt ? `Verificada el ${new Date(settings.connection.verifiedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}` : "Conexión configurada desde el servidor"}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => { await api("/api/tiendanube/connection", "PATCH"); await load(); await onChanged(); setMessage("Acceso a la tienda y lectura de productos verificados"); })}>Verificar acceso</Button>
        {settings.connection.source === "panel" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDisconnect(true)}>Desconectar del panel</Button>}
      </div>
    </div>}
    {!loading && settings?.connection?.source !== "environment" && <details open={!settings?.connection} className="space-y-4">
      <summary className="cursor-pointer text-sm font-medium">{settings?.connection ? "Configurar o volver a autorizar la app privada" : "Vincular una app privada"}</summary>
      <p className="text-sm text-[var(--color-fg-muted)]">Compatible con el plan Esencial. Creá una app de tipo “Para tus clientes” en el <a href="https://partners.tiendanube.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Portal de Socios</a> y habilitá lectura y escritura de productos. No necesita publicarse en la Tienda de Aplicaciones.</p>
      <Input label="URL de retorno para configurar en Tiendanube" readOnly value={settings?.callbackUrl ?? ""} hint="Copiá esta dirección en el campo de redirección de tu app." />
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); act(async () => {
        await api("/api/tiendanube/connection", "POST", { clientId: clientId.trim(), clientSecret: secret, shopUrl: shopUrl.trim(), contactEmail: email.trim() });
        setSecret(""); await load(); setMessage("App guardada. Ahora autorizá el acceso desde tu Tiendanube");
      }); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Dirección de tu tienda" type="url" required disabled={busy} value={shopUrl} onChange={e => setShopUrl(e.target.value)} />
          <Input label="Correo de contacto de la integración" type="email" required disabled={busy} value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="ID de la aplicación" inputMode="numeric" pattern="[0-9]+" required disabled={busy} value={clientId} onChange={e => setClientId(e.target.value)} />
          <Input label="Clave secreta de la aplicación" type="password" autoComplete="new-password" required disabled={busy} value={secret} onChange={e => setSecret(e.target.value)} hint={settings?.app ? "La clave guardada no se muestra. Cargala otra vez solo si vas a cambiar la app." : "Se guarda cifrada y no se muestra al volver a abrir el panel."} />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !secret || !clientId || !email}>Guardar app</Button>
      </form>
      {settings?.app && <div className="space-y-2"><Button variant="primary" disabled={busy} onClick={() => act(async () => {
        const result = await api<{ url: string }>("/api/tiendanube/oauth/start", "POST"); window.location.assign(result.url);
      })}>Autorizar conexión en Tiendanube</Button><p className="text-xs text-[var(--color-fg-muted)]">Se abrirá {settings.app.shopUrl}. Ingresá a esa tienda y revisá los permisos antes de aceptar. Este paso solo vincula el panel; los productos se envían después desde su vista previa.</p></div>}
    </details>}
    <ConfirmDialog open={disconnect} onOpenChange={setDisconnect} title="Desconectar Tiendanube del panel" description="Se quitará la conexión guardada en este panel. Tus productos y vínculos se conservan. Para revocar el acceso de la app también podés desinstalarla desde Tiendanube." confirmText="Desconectar" loading={busy} onConfirm={() => act(async () => { await api("/api/tiendanube/connection", "DELETE"); setDisconnect(false); await load(); await onChanged(); setMessage("La tienda quedó desconectada de este panel"); })} />
  </section>;
}
