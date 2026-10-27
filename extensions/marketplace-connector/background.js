"use strict";
const PANEL_ORIGINS = new Set(["https://db.vidaeventofiesta.site", "http://localhost:3001", "http://127.0.0.1:3001"]);
const CREATE_URL = "https://www.facebook.com/marketplace/create/item";
const uuid = v => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
function panelTab(tab) { try { const u = new URL(tab?.url); return PANEL_ORIGINS.has(u.origin) && /^\/marketplace\/?$/.test(u.pathname); } catch { return false; } }
function publicPhotoOrigin(raw) {
  const u = new URL(raw);
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || !h.includes(".") || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith(".local") || h.endsWith(".internal") || h.startsWith("[")) throw new Error("Una foto usa un enlace no admitido. Cargala manualmente desde el inventario.");
  return u.origin;
}
function validatePayload(p) {
  if (!p || p.protocol !== 1 || !uuid(p.itemId) || !uuid(p.handoffId) || !Number.isSafeInteger(p.revision) || p.revision < 1 || typeof p.sourceVersion !== "string" || !Number.isFinite(Date.parse(p.createdAt)) || Math.abs(Date.now() - Date.parse(p.createdAt)) > 10 * 60 * 1000) throw new Error("La preparación venció. Enviá de nuevo desde PLUG.");
  for (const [key, max] of [["title", 100], ["description", 1500], ["condition", 40], ["category", 80], ["location", 80]]) if (typeof p[key] !== "string" || !p[key].trim() || p[key].length > max) throw new Error("La publicación tiene campos incompletos.");
  if (!Number.isFinite(p.price) || p.price <= 0 || p.price > 99999999 || !Array.isArray(p.photos) || !p.photos.length || p.photos.length > 9 || JSON.stringify(p).length > 8.5 * 1024 * 1024) throw new Error("Revisá precio y fotos en PLUG.");
  for (const photo of p.photos) {
    if (typeof photo.source !== "string" || typeof photo.name !== "string" || !/^[a-zA-Z0-9.-]+$/.test(photo.name)) throw new Error("Una foto no es válida.");
    if (photo.source.startsWith("data:")) { if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo.source) || photo.source.length > 900000) throw new Error("Una foto no es válida o es demasiado grande."); }
    else publicPhotoOrigin(photo.source);
  }
  return p;
}
async function pending() {
  const value = (await chrome.storage.session.get("pending")).pending;
  if (!value) throw new Error("Elegí un producto en PLUG y pulsá Cargar en Facebook.");
  validatePayload(value.payload); return value;
}
async function fetchImage(photo) {
  const external = !photo.source.startsWith("data:");
  if (external && !await chrome.permissions.contains({ origins: [`${publicPhotoOrigin(photo.source)}/*`] })) throw new Error("Falta permiso para leer una foto. Volvé a abrir la extensión y autorizá su origen.");
  const response = await fetch(photo.source, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000) });
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("No se pudo descargar una foto. Podés cargarla manualmente desde PLUG.");
  const reader = response.body.getReader(), parts = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 3 * 1024 * 1024) { await reader.cancel(); throw new Error("Una foto supera 3 MB. Reducila o cargala manualmente."); } parts.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name: photo.name.replace(/\.jpg$/, type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg"), source: `data:${type};base64,${btoa(binary)}`, bytes: size };
}
async function handle(m, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error("Conexión no permitida.");
  if (["PLUG_MARKETPLACE_PING", "PLUG_MARKETPLACE_PREPARE"].includes(m.type)) {
    if (sender.frameId !== 0 || !panelTab(sender.tab)) throw new Error("Abrí Marketplace desde tu panel PLUG.");
    if (m.type === "PLUG_MARKETPLACE_PING") return { available: true, version: chrome.runtime.getManifest().version };
    const payload = validatePayload(m.payload);
    const previous = (await chrome.storage.session.get("pending")).pending;
    if (previous && !previous.applied && Date.now() - Date.parse(previous.payload.createdAt) < 10 * 60 * 1000) {
      if (previous.payload.handoffId === payload.handoffId) return { prepared: true };
      throw new Error("Hay un aviso pendiente en la extensión. Cargalo o descartalo antes de preparar otro.");
    }
    const tab = await chrome.tabs.create({ url: CREATE_URL, active: true });
    try { await chrome.storage.session.set({ pending: { payload, panelTabId: sender.tab.id, targetTabId: tab.id, panelOrigin: new URL(sender.tab.url).origin, applied: false } }); }
    catch (e) { await chrome.tabs.remove(tab.id); throw e; }
    return { prepared: true };
  }
  // Popup-only commands: a web content script cannot invoke arbitrary tab scripting.
  if (sender.tab || !sender.url?.startsWith(chrome.runtime.getURL("popup.html"))) throw new Error("Abrí la extensión desde su ícono en Chrome.");
  if (m.type === "PLUG_MARKETPLACE_CLEAR") { await chrome.storage.session.remove("pending"); return { ok: true }; }
  if (m.type === "PLUG_MARKETPLACE_VIEW") {
    const p = await pending(); return { title: p.payload.title, applied: p.applied, origins: [...new Set(p.payload.photos.filter(photo => !photo.source.startsWith("data:")).map(photo => `${publicPhotoOrigin(photo.source)}/*`))] };
  }
  if (m.type === "PLUG_MARKETPLACE_OPEN") { const p = await pending(); await chrome.tabs.update(p.targetTabId, { active: true }); return { ok: true }; }
  if (m.type !== "PLUG_MARKETPLACE_FILL") throw new Error("Acción no válida.");
  const p = await pending();
  if (p.applied) throw new Error("Este aviso ya se cargó. Revisalo en Facebook y publicá allí.");
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current?.id !== p.targetTabId || current.url !== CREATE_URL) throw new Error("Abrí el formulario preparado con el botón de abajo.");
  const source = await chrome.tabs.get(p.panelTabId);
  if (!panelTab(source) || new URL(source.url).origin !== p.panelOrigin) throw new Error("La pestaña de PLUG cambió. Prepará el aviso nuevamente.");
  const check = await chrome.tabs.sendMessage(p.panelTabId, { type: "PLUG_MARKETPLACE_VALIDATE", payload: p.payload });
  if (!check?.valid) throw new Error(check?.error || "No se pudo comprobar el producto en PLUG.");
  const images = []; let total = 0;
  if (m.withPhotos !== false) for (const photo of p.payload.photos) { const image = await fetchImage(photo); total += image.bytes; if (total > 12 * 1024 * 1024) throw new Error("La galería supera 12 MB. Cargá las fotos manualmente."); images.push(image); }
  await chrome.scripting.executeScript({ target: { tabId: p.targetTabId }, files: ["fill.js"] });
  const results = await chrome.scripting.executeScript({ target: { tabId: p.targetTabId }, func: async (payload, replace) => await globalThis.PLUG_MARKETPLACE_FILL(payload, replace), args: [{ ...p.payload, photos: images }, m.replace === true] });
  const result = results[0]?.result;
  if (!result?.ok) throw new Error(result?.error || "No se pudo completar el formulario. Copiá los datos desde PLUG.");
  p.applied = true; await chrome.storage.session.set({ pending: p });
  return result;
}
let filling = false;
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || typeof m.type !== "string" || !m.type.startsWith("PLUG_MARKETPLACE_")) return;
  const fill = m.type === "PLUG_MARKETPLACE_FILL";
  if (fill && filling) { reply({ error: "La publicación se está cargando. Esperá a que termine." }); return; }
  if (fill) filling = true;
  handle(m, sender).then(reply).catch(e => reply({ error: e.message || "No se pudo completar la operación." })).finally(() => { if (fill) filling = false; });
  return true;
});
