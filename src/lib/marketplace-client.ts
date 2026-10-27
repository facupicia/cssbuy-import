export function marketplaceConnector(action: "ping" | "prepare", itemId?: string, revision?: number): Promise<{ available?: boolean; version?: string; prepared?: boolean }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(action === "ping" ? "No se detectó la extensión. Instalála y recargá esta página." : "No se pudo preparar la publicación. Revisá el conector antes de reintentar.")); }, action === "ping" ? 2000 : 30000);
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "PLUG_MARKETPLACE_RESPONSE" || event.data.id !== id) return;
      cleanup(); if (event.data.error) reject(new Error(String(event.data.error))); else resolve(event.data);
    };
    window.addEventListener("message", receive);
    window.postMessage({ channel: "PLUG_MARKETPLACE_REQUEST", id, action, itemId, revision }, location.origin);
  });
}
