"use strict";
// Runs only in Chrome's isolated world after an explicit popup action.
// This adapter never clicks Next, Publish, Save draft, boost or privacy controls.
globalThis.PLUG_MARKETPLACE_FILL = async function (payload, replace = false) {
  const norm = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = e => e.getClientRects().length > 0 && !e.disabled;
  const form = document.querySelector('form[aria-label="Marketplace"], [role="form"][aria-label="Marketplace"]');
  if (!form || location.hostname !== "www.facebook.com" || location.pathname !== "/marketplace/create/item") return { error: "No se encontró el formulario de Marketplace. Abrilo en español y volvé a intentar." };
  const field = names => [...form.querySelectorAll("input:not([type=file]):not([type=checkbox]),textarea")].find(e => visible(e) && names.includes(norm(e.getAttribute("aria-label") || e.closest("label")?.innerText || document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText)));
  const waitFor = async get => {
    const found = get(); if (found) return found;
    return await new Promise(resolve => {
      const observer = new MutationObserver(() => { const value = get(); if (value) { clearTimeout(timer); observer.disconnect(); resolve(value); } });
      const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, 4000);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    });
  };
  const set = (e, value) => {
    const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(e, value);
    e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
  };
  try {
    let description = field(["descripcion", "description"]);
    if (!description) {
      const more = [...form.querySelectorAll('button,[role="button"]')].find(e => visible(e) && /^(mas detalles|more details)/.test(norm(e.innerText)));
      if (more) more.click(); description = await waitFor(() => field(["descripcion", "description"]));
    }
    const title = field(["titulo", "title"]), price = field(["precio", "price"]);
    if (!title || !price || !description) return { error: "Facebook cambió los campos. No se reemplazó el texto. Copiá título y descripción desde PLUG." };
    const writes = [[title, payload.title], [price, String(payload.price)], [description, payload.description]];
    const hasOther = writes.some(([e, value]) => e.value.trim() && e.value.trim() !== value.trim());
    if (hasOther && !replace) return { error: "El formulario ya tiene datos. Revisalo o habilitá Reemplazar el texto existente en la extensión." };
    for (const [e, value] of writes) set(e, value);
    const warnings = [];
    async function select(label, desired) {
      const box = [...form.querySelectorAll('[role="combobox"]')].find(e => norm(e.getAttribute("aria-label") || e.closest("label")?.innerText || e.innerText).startsWith(norm(label)));
      if (!box || !visible(box)) { warnings.push(`Elegí ${label} manualmente.`); return; }
      if (norm(box.innerText).includes(norm(desired))) return;
      box.click();
      const root = await waitFor(() => document.querySelector('[role="listbox"], [role="dialog"][aria-label="Menú desplegable"]'));
      const option = root && [...root.querySelectorAll('[role="option"],button,[role="button"]')].find(e => norm(e.innerText).replace(/ envio disponible$/, "") === norm(desired));
      if (option && visible(option)) option.click();
      else { box.click(); warnings.push(`Elegí ${label} manualmente: ${desired}.`); }
    }
    await select("Categoría", payload.category);
    await select("Estado", payload.condition);
    if (payload.photos.length) {
      const input = [...form.querySelectorAll('input[type="file"]')].find(e => e.accept?.includes("image"));
      const photoStatus = [...form.querySelectorAll('[role="status"]')].some(e => /[1-9]\d* fotos? adjuntas?/.test(norm(e.innerText)));
      if (!input) warnings.push("Cargá las fotos manualmente.");
      else if (input.files?.length || photoStatus) warnings.push("Ya había fotos en el formulario. Revisalas; no se agregaron duplicados.");
      else {
        const files = new DataTransfer();
        for (const photo of payload.photos) { const r = await fetch(photo.source); const blob = await r.blob(); files.items.add(new File([blob], photo.name, { type: blob.type })); }
        input.files = files.files; input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else warnings.push("Cargá las fotos manualmente desde PLUG.");
    warnings.push(`Revisá que la ubicación sea ${payload.location}, los talles y que las fotos terminen de subir antes de publicar.`);
    title.focus();
    return { ok: true, message: "Título, precio y descripción cargados. Revisá el aviso y publicá desde Facebook.", warnings };
  } catch { return { error: "La carga quedó incompleta. Revisá el formulario y reintentá; la extensión no publicó el aviso." }; }
};
