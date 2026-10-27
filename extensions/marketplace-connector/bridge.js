(() => {
  "use strict";
  const allowed = new Set(["https://db.vidaeventofiesta.site", "http://localhost:3001", "http://127.0.0.1:3001"]);
  if (window.top !== window || !allowed.has(location.origin)) return;
  const inWorkspace = () => /^\/marketplace\/?$/.test(location.pathname);
  const uuid = v => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
  const api = async body => {
    const response = await fetch("/api/marketplace", { cache: "no-store", credentials: "same-origin", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || "Revisá la sesión de PLUG."); return value;
  };
  let preparing = false;
  window.addEventListener("message", async event => {
    const m = event.data;
    if (!inWorkspace() || event.source !== window || event.origin !== location.origin || m?.channel !== "PLUG_MARKETPLACE_REQUEST" || !uuid(m.id)) return;
    const respond = data => window.postMessage({ channel: "PLUG_MARKETPLACE_RESPONSE", id: m.id, ...data }, location.origin);
    try {
      if (m.action === "ping") { await api(); respond(await chrome.runtime.sendMessage({ type: "PLUG_MARKETPLACE_PING" })); return; }
      if (m.action !== "prepare" || !uuid(m.itemId) || !Number.isSafeInteger(m.revision) || m.revision < 1) return;
      if (preparing) throw new Error("Esperá a que termine el envío anterior.");
      preparing = true;
      try {
        const { payload } = await api({ action: "export", itemId: m.itemId, revision: m.revision });
        const result = await chrome.runtime.sendMessage({ type: "PLUG_MARKETPLACE_PREPARE", payload });
        if (result?.error) throw new Error(result.error); respond(result);
      } finally { preparing = false; }
    } catch (e) { respond({ error: e.message || "No se pudo conectar la extensión. Recargá PLUG y reintentá." }); }
  });
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id || m?.type !== "PLUG_MARKETPLACE_VALIDATE") return;
    (async () => {
      try {
        if (!inWorkspace()) throw new Error("Volvé a Marketplace en PLUG para comprobar el producto.");
        const state = await api(), p = state.products.find(p => p.id === m.payload.itemId), d = state.drafts.find(d => d.itemId === m.payload.itemId);
        const fields = ["title", "description", "price", "condition", "category", "location", "sourceVersion"];
        if (!p || !d || p.issues.length || p.version !== m.payload.sourceVersion || !["draft", "sent"].includes(d.status) || d.listingUrl || fields.some(k => d[k] !== m.payload[k])) throw new Error("El producto o borrador cambió. Volvé a PLUG y prepará el aviso nuevamente.");
        reply({ valid: true });
      } catch (e) { reply({ error: e.message || "Abrí PLUG e iniciá sesión antes de cargar el aviso." }); }
    })();
    return true;
  });
})();
