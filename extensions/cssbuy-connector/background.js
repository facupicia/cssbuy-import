importScripts("collector.js", "product-collector.js");
const PANEL = "https://db.vidaeventofiesta.site";
let running = false;
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: PANEL + "/" }));
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || new URL(sender.url || "about:blank").origin !== PANEL) return;
  if (!["PLUG_CSSBUY_COLLECT", "PLUG_CSSBUY_PRODUCT"].includes(message?.type)) return;
  if (running) { reply({ error: "Ya hay una sincronización en curso." }); return; }
  running = true;
  (async () => {
    if (message.type === "PLUG_CSSBUY_PRODUCT") {
      const url = new URL(message.url);
      if (url.origin !== "https://www.cssbuy.com" || url.pathname !== "/shop/goodsDetail" || !/^\d{1,30}$/.test(url.searchParams.get("id") || "") || !/^[a-zA-Z0-9_]{1,30}$/.test(url.searchParams.get("type") || "") || url.username || url.password) throw new Error("Enlace de producto inválido.");
      const tabs = await chrome.tabs.query({ url: "https://www.cssbuy.com/shop/goodsDetail*" });
      const tab = tabs.find(tab => {
        const current = new URL(tab.url);
        return current.searchParams.get("id") === url.searchParams.get("id") && current.searchParams.get("type") === url.searchParams.get("type");
      });
      if (!tab) {
        await chrome.tabs.create({ url: url.href });
        throw new Error("Abrí el producto en la nueva pestaña de CSSBuy, esperá a que cargue y volvé a pulsar Leer enlace en PLUG.");
      }
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", func: collectCssbuyProduct });
      if (!result[0]?.result) throw new Error("No se pudo leer el producto. Revisá su pestaña o completá los datos a mano.");
      reply({ product: result[0].result });
      return;
    }
    const tabs = await chrome.tabs.query({ url: "https://www.cssbuy.com/*" });
    const tab = tabs.find(t => t.url?.includes("/shop/cate/order")) ?? tabs[0];
    if (!tab) {
      await chrome.tabs.create({ url: "https://www.cssbuy.com/shop/cate/order" });
      throw new Error("Iniciá sesión en la pestaña de CSSBuy y volvé a sincronizar desde PLUG.");
    }
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: collectCssbuy });
    if (!result[0]?.result) throw new Error("No se pudieron leer los datos de CSSBuy. Revisá su pestaña.");
    reply({ data: result[0].result });
  })().catch(e => reply({ error: e.message || "No se pudo consultar CSSBuy." })).finally(() => { running = false; });
  return true;
});
