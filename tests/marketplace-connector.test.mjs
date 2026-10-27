import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = 'extensions/marketplace-connector/';
const payload = () => ({ protocol: 1, handoffId: '00000000-0000-4000-8000-000000000002', itemId: '00000000-0000-4000-8000-000000000001', revision: 1, sourceVersion: '2026-01-01T00:00:00.000Z', createdAt: new Date().toISOString(), title: 'Remera de prueba talle L', description: 'Talle L.\nRetiro en Rosario.', price: 52000, condition: 'Nuevo', category: 'Ropa y calzado de hombre', location: 'Rosario', photos: [{ source: 'data:image/png;base64,aGVsbG8=', name: 'plug-test.jpg' }] });
function worker() {
  const storage = {}, tabs = new Map([[1, { id: 1, url: 'https://db.vidaeventofiesta.site/marketplace' }]]); let callback, nextId = 2, executions = 0;
  const chrome = { runtime: { id: 'fixture', getManifest: () => ({ version: '1.0.0' }), getURL: v => `chrome-extension://fixture/${v}`, onMessage: { addListener: cb => { callback = cb; } } },
    storage: { session: { get: async key => ({ [key]: storage[key] }), set: async values => Object.assign(storage, values), remove: async key => { delete storage[key]; } } },
    tabs: { create: async ({ url }) => { const t = { id: nextId++, url }; tabs.set(t.id, t); return t; }, get: async id => tabs.get(id), query: async () => [tabs.get(storage.pending.targetTabId)], update: async id => tabs.get(id), remove: async id => tabs.delete(id), sendMessage: async () => ({ valid: true }) },
    permissions: { contains: async () => true }, scripting: { executeScript: async options => { executions++; return options.func ? [{ result: { ok: true, message: 'Cargado', warnings: [] } }] : []; } } };
  const context = vm.createContext({ chrome, URL, Date, Set, Error, JSON, Number, console, AbortSignal }); vm.runInContext(readFileSync(base + 'background.js', 'utf8'), context);
  const panel = { id: 'fixture', frameId: 0, tab: tabs.get(1), url: tabs.get(1).url }, popup = { id: 'fixture', url: 'chrome-extension://fixture/popup.html' };
  const call = (message, sender = panel) => new Promise(resolve => { callback(message, sender, result => setImmediate(() => resolve(result))); });
  return { call, panel, popup, storage, tabs, executions: () => executions };
}
test('conector: solo PLUG superior puede preparar; datos vencidos y fotos privadas se rechazan', async () => {
  const w = worker();
  assert.equal((await w.call({ type: 'PLUG_MARKETPLACE_PREPARE', payload: payload() }, { ...w.panel, tab: { id: 1, url: 'https://evil.test/marketplace' } })).error, 'Abrí Marketplace desde tu panel PLUG.');
  assert.ok((await w.call({ type: 'PLUG_MARKETPLACE_PREPARE', payload: { ...payload(), createdAt: '2000-01-01T00:00:00Z' } })).error);
  for (const source of ['https://127.0.0.1/private', 'https://10.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://foo.internal/x', 'javascript:alert(1)']) assert.ok((await w.call({ type: 'PLUG_MARKETPLACE_PREPARE', payload: { ...payload(), photos: [{ source, name: 'test.jpg' }] } })).error);
  assert.equal(w.tabs.size, 1);
});
test('conector: evita sobrescribir otro envío y ejecuta la carga una sola vez desde popup', async () => {
  const w = worker();
  assert.equal((await w.call({ type: 'PLUG_MARKETPLACE_PREPARE', payload: payload() })).prepared, true);
  assert.ok((await w.call({ type: 'PLUG_MARKETPLACE_PREPARE', payload: { ...payload(), handoffId: '00000000-0000-4000-8000-000000000003' } })).error);
  assert.ok((await w.call({ type: 'PLUG_MARKETPLACE_FILL', withPhotos: false })).error);
  const result = await w.call({ type: 'PLUG_MARKETPLACE_FILL', withPhotos: false }, w.popup); assert.equal(result.ok, true); assert.equal(w.executions(), 2);
  assert.ok((await w.call({ type: 'PLUG_MARKETPLACE_FILL', withPhotos: false }, w.popup)).error); assert.equal(w.executions(), 2);
  await w.call({ type: 'PLUG_MARKETPLACE_CLEAR' }, w.popup); assert.equal(w.storage.pending, undefined);
});
test('conector: cambio de pestaña fuente impide cargar datos que ya no se pueden verificar', async () => {
  const w = worker(); await w.call({ type: 'PLUG_MARKETPLACE_PREPARE', payload: payload() });
  w.tabs.set(1, { id: 1, url: 'https://evil.test/' });
  assert.ok((await w.call({ type: 'PLUG_MARKETPLACE_FILL', withPhotos: false }, w.popup)).error); assert.equal(w.executions(), 0);
});
function dom({ existing = '', withDescription = true, photoCount = 0 } = {}) {
  let moreClicks = 0, optionClicks = 0, unsafeClicks = 0;
  class Input { constructor(label, value = '') { this.label = label; this._value = value; this.tagName = 'INPUT'; this.disabled = false; } get value() { return this._value; } set value(v) { this._value = v; } getClientRects() { return [1]; } getAttribute(k) { return k === 'aria-label' ? this.label : null; } closest() { return null; } dispatchEvent() {} focus() {} }
  class Textarea extends Input { constructor(label, value) { super(label, value); this.tagName = 'TEXTAREA'; } get value() { return this._value; } set value(v) { this._value = v; } }
  const title = new Input('Título', existing), price = new Input('Precio'), description = new Textarea('Descripción', ''), file = new Input('', ''); file.accept = 'image/*'; file.files = { length: photoCount };
  let expanded = withDescription;
  const more = { innerText: 'Más detalles Incluye otros detalles', disabled: false, getClientRects: () => [1], click: () => { moreClicks++; expanded = true; } };
  const boxes = ['Categoría', 'Estado'].map(label => ({ innerText: `${label} ${label === 'Estado' ? 'Nuevo' : 'Ropa y calzado de hombre'}`, getAttribute: k => k === 'aria-label' ? label : null, closest: () => null, getClientRects: () => [1], click: () => { optionClicks++; } }));
  const form = { querySelectorAll: selector => selector.startsWith('input:not') ? [title, price, ...(expanded ? [description] : [])] : selector === 'input[type="file"]' ? [file] : selector === '[role="combobox"]' ? boxes : selector === '[role="status"]' ? [] : [more] };
  const document = { body: {}, querySelector: selector => selector.startsWith('form[') ? form : null };
  const context = vm.createContext({ document, location: { hostname: 'www.facebook.com', pathname: '/marketplace/create/item' }, HTMLInputElement: Input, HTMLTextAreaElement: Textarea, CSS: { escape: s => s }, Event: class {}, MutationObserver: class {}, setTimeout, clearTimeout, fetch,
    DataTransfer: class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } }, File });
  vm.runInContext(readFileSync(base + 'fill.js', 'utf8'), context);
  return { fill: context.PLUG_MARKETPLACE_FILL, title, price, description, file, clicks: () => ({ moreClicks, optionClicks, unsafeClicks }) };
}
test('adaptador: abre Más detalles, carga campos por etiquetas y se detiene antes de publicar', async () => {
  const d = dom({ withDescription: false }); const p = payload(); p.photos = [];
  const r = await d.fill(p); assert.equal(r.ok, true); assert.equal(d.title.value, p.title); assert.equal(d.price.value, '52000'); assert.equal(d.description.value, p.description);
  assert.equal(d.clicks().moreClicks, 1); assert.equal(d.clicks().unsafeClicks, 0);
});
test('adaptador: protege texto existente y requiere reemplazo explícito', async () => {
  const d = dom({ existing: 'Otro producto' }); const p = payload(); p.photos = [];
  assert.ok((await d.fill(p)).error); assert.equal(d.title.value, 'Otro producto');
  assert.equal((await d.fill(p, true)).ok, true); assert.equal(d.title.value, p.title);
});
test('adaptador: fotos previas se conservan sin duplicarlas', async () => {
  const d = dom({ photoCount: 1 }); const result = await d.fill(payload()); assert.equal(result.ok, true); assert.ok(result.warnings.some(w => w.includes('no se agregaron duplicados')));
});
test('adaptador: transfiere imágenes al selector conservando nombre, tipo y contenido', async () => {
  const d = dom(); const result = await d.fill(payload());
  assert.equal(result.ok, true); assert.equal(d.file.files.length, 1);
  assert.equal(d.file.files[0].name, 'plug-test.jpg'); assert.equal(d.file.files[0].type, 'image/png');
  assert.equal(await d.file.files[0].text(), 'hello');
});
test('puente: funciona al navegar desde inicio y vuelve a comprobar stock y contenido antes de cargar', async () => {
  let pageListener, runtimeListener, calls = 0;
  const p = payload(), location = { origin: 'https://db.vidaeventofiesta.site', pathname: '/' };
  const window = { addEventListener: (_, cb) => { pageListener = cb; }, postMessage: () => {} }; window.top = window;
  const state = { products: [{ id: p.itemId, version: p.sourceVersion, issues: [] }], drafts: [{ ...p, status: 'sent', listingUrl: null }] };
  const chrome = { runtime: { id: 'fixture', sendMessage: async () => { calls++; return { available: true }; }, onMessage: { addListener: cb => { runtimeListener = cb; } } } };
  vm.runInContext(readFileSync(base + 'bridge.js', 'utf8'), vm.createContext({ window, location, chrome, fetch: async () => ({ ok: true, json: async () => state }), Set, Error, Number }));
  const event = { source: window, origin: location.origin, data: { channel: 'PLUG_MARKETPLACE_REQUEST', id: p.handoffId, action: 'ping' } };
  await pageListener(event); assert.equal(calls, 0);
  location.pathname = '/marketplace'; await pageListener(event); assert.equal(calls, 1);
  const validate = () => new Promise(resolve => runtimeListener({ type: 'PLUG_MARKETPLACE_VALIDATE', payload: p }, { id: 'fixture' }, resolve));
  assert.equal((await validate()).valid, true);
  state.products[0].issues = ['Sin unidades disponibles.']; assert.ok((await validate()).error);
  state.products[0].issues = []; state.drafts[0].price++; assert.ok((await validate()).error);
  state.drafts[0].price--; location.pathname = '/'; assert.ok((await validate()).error);
});
