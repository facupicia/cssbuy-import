import { cssbuyProductUrl } from "./purchase-plans";

export interface ProductReading { url: string; nombre: string; precioCNY: number | null; leidoEn: string }
export function readCssbuyProduct(url: string): Promise<ProductReading> {
  const normalized = cssbuyProductUrl(url);
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("No se pudo leer el enlace. Instalá o actualizá el conector CSSBuy y recargá PLUG en Chrome. También podés completar los datos a mano.")); }, 10000);
    function cleanup() { window.clearTimeout(timer); window.removeEventListener("message", receive); }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "PLUG_CSSBUY_RESPONSE" || event.data.id !== id) return;
      cleanup();
      if (event.data.error) { reject(new Error(String(event.data.error))); return; }
      try {
        const value = event.data.product;
        if (!value || cssbuyProductUrl(value.url) !== normalized || typeof value.nombre !== "string" || value.nombre.length > 200 || (value.precioCNY !== null && (typeof value.precioCNY !== "number" || !Number.isFinite(value.precioCNY) || value.precioCNY <= 0 || value.precioCNY > 1000000))) throw new Error();
        resolve({ url: normalized, nombre: value.nombre, precioCNY: value.precioCNY, leidoEn: new Date().toISOString() });
      } catch { reject(new Error("CSSBuy no devolvió datos de producto válidos. Completalos a mano.")); }
    }
    window.addEventListener("message", receive);
    window.postMessage({ channel: "PLUG_CSSBUY_REQUEST", id, action: "product", url: normalized }, location.origin);
  });
}
