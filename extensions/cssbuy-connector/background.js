importScripts("collector.js");
const PANEL = "https://db.vidaeventofiesta.site";
let running = false;
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: PANEL + "/" }));
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || new URL(sender.url || "about:blank").origin !== PANEL) return;
  if (message?.type !== "PLUG_CSSBUY_COLLECT") return;
  if (running) { reply({ error: "Ya hay una sincronización en curso." }); return; }
  running = true;
  (async () => {
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
