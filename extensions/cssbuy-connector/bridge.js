(() => {
  if (location.origin !== "https://db.vidaeventofiesta.site") return;
  let running = false;
  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (message?.channel !== "PLUG_CSSBUY_REQUEST" || typeof message.id !== "string" || message.id.length > 100) return;
    const respond = data => window.postMessage({ channel: "PLUG_CSSBUY_RESPONSE", id: message.id, ...data }, location.origin);
    if (message.action === "ping") { respond({ available: true, version: chrome.runtime.getManifest().version }); return; }
    if (message.action !== "sync" || running) return;
    running = true;
    try {
      // Verifica la sesión PLUG antes de consultar o transmitir datos privados.
      const session = await fetch("/api/tiendanube/session", { cache: "no-store" }).then(r => r.json());
      if (!session.authenticated) throw new Error("Ingresá la contraseña de administración en PLUG antes de sincronizar.");
      const result = await chrome.runtime.sendMessage({ type: "PLUG_CSSBUY_COLLECT" });
      if (result?.error) throw new Error(result.error);
      const response = await fetch("/api/cssbuy/bridge", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify(result.data), signal: AbortSignal.timeout(60000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron guardar los datos en PLUG.");
      respond({ result: data });
    } catch (e) { respond({ error: e.message || "No se pudo sincronizar CSSBuy." }); }
    finally { running = false; }
  });
})();
