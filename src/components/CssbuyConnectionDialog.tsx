"use client";

import { useEffect, useState } from "react";
import type { CssbuyOrder, CssbuyTransaction } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

type SyncData = { orders: CssbuyOrder[]; records: CssbuyTransaction[]; imported: number; inserted: number; updated: number;
  warning: string | null; lastSync: { synced_at: string; orders_count: number; records_count: number | null; records_warning?: string | null } | null };

function browserRequest(action: "ping" | "sync"): Promise<{ available?: boolean; result?: SyncData }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(action === "ping" ? "Conector no detectado" : "La sincronización tardó demasiado. Revisá la pestaña de CSSBuy antes de reintentar.")); }, action === "ping" ? 1500 : 180000);
    function cleanup() { window.clearTimeout(timer); window.removeEventListener("message", receive); }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== "PLUG_CSSBUY_RESPONSE" || event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(String(event.data.error)));
      else resolve(event.data);
    }
    window.addEventListener("message", receive);
    window.postMessage({ channel: "PLUG_CSSBUY_REQUEST", id, action }, window.location.origin);
  });
}

export function CssbuyConnectionDialog({ open, onOpenChange, onSynced, onBusyChange }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSynced: (data: SyncData) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [lastSync, setLastSync] = useState<SyncData["lastSync"]>(null);
  async function check() {
    setChecking(true);
    try {
      const session = await fetch("/api/tiendanube/session", { cache: "no-store" }).then(r => r.json());
      setAuthenticated(Boolean(session.authenticated));
      if (session.authenticated) {
        const status = await fetch("/api/cssbuy/bridge", { cache: "no-store" });
        if (!status.ok) throw new Error("No se pudo consultar el último estado de CSSBuy.");
        const data = await status.json(); setLastSync(data.lastSync); setWarning(data.lastSync?.records_warning || "");
      }
      try { setAvailable(Boolean((await browserRequest("ping")).available)); } catch { setAvailable(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo comprobar la conexión."); }
    finally { setChecking(false); }
  }
  useEffect(() => { if (open) { setError(""); setMessage(""); void check(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function login() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/tiendanube/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo ingresar.");
      setPassword(""); await check();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo ingresar."); }
    finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true); onBusyChange(true); setError(""); setWarning(""); setMessage("Leyendo pedidos y movimientos desde tu sesión de CSSBuy…");
    try {
      const data = (await browserRequest("sync")).result;
      if (!data) throw new Error("El conector no devolvió un resultado válido.");
      onSynced(data); setLastSync(data.lastSync); setWarning(data.warning || "");
      setMessage(`${data.imported} pedidos válidos procesados: ${data.inserted} nuevos y ${data.updated} actualizados. ${data.records.length} movimientos guardados.`);
    } catch (e) { setMessage(""); setError(e instanceof Error ? e.message : "No se pudo sincronizar."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
    <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Conectar CSSBuy</DialogTitle><DialogDescription>Traé tus pedidos, pesos, fotos y movimientos a la calculadora desde Chrome.</DialogDescription></DialogHeader>
      <div className="space-y-4 text-sm">
        <p>La sesión queda en CSSBuy. El conector solo lee tus datos cuando iniciás una sincronización.</p>
        {!authenticated && <div className="space-y-3">
          <Input label="Contraseña de administración" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} hint="La misma que usás para conectar Tiendanube." />
          <Button disabled={busy || !password} onClick={login}>Ingresar</Button>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--color-bg-subtle)] p-3">
          <span>{checking ? "Comprobando conector…" : available ? "Conector de Chrome detectado" : "Falta instalar el conector en Chrome"}</span>
          <Button variant="outline" size="sm" disabled={checking || busy} onClick={check}>Comprobar conector</Button>
        </div>
        {!available && <div className="space-y-3">
          <h3 className="font-semibold">Instalación por única vez</h3>
          <ol className="list-decimal space-y-2 pl-5">
            <li><a href="/plug-cssbuy-connector.zip" download className="text-[var(--color-info)] underline">Descargá el conector PLUG</a> y extraé el ZIP en una carpeta.</li>
            <li>Abrí <code>chrome://extensions</code>, activá <strong>Modo de desarrollador</strong> y elegí <strong>Cargar descomprimida</strong>. Seleccioná la carpeta que contiene <code>manifest.json</code>.</li>
            <li>Recargá esta página y dejá CSSBuy abierto con tu sesión iniciada.</li>
          </ol>
          <p className="text-xs text-[var(--color-fg-muted)]">La sincronización se realiza desde Chrome en tu computadora.</p>
        </div>}
        <a href="https://www.cssbuy.com/shop/cate/order" target="_blank" rel="noreferrer" className="block w-fit text-[var(--color-info)] underline">Abrir mis pedidos en CSSBuy</a>
        {lastSync && <p className="text-xs text-[var(--color-fg-muted)]">Última sincronización real: {new Date(lastSync.synced_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} · {lastSync.orders_count} pedidos.</p>}
        {message && <p role="status">{message}</p>}
        {warning && <p role="alert" className="text-[var(--color-warning)]">{warning}</p>}
        {error && <p role="alert" className="text-[var(--color-danger)]">{error}</p>}
        <Button disabled={!authenticated || !available || checking || busy} onClick={sync}>{busy ? "Sincronizando…" : "Sincronizar pedidos y movimientos"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
