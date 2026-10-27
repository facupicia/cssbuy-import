"use strict";
const $ = id => document.getElementById(id);
let state;
async function send(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...extra });
  if (result?.error) throw new Error(result.error); return result;
}
function status(message, error = false) { $("status").textContent = message; $("status").dataset.error = String(error); }
async function init() {
  try { state = await send("PLUG_MARKETPLACE_VIEW"); $("product").textContent = state.title; $("fill").disabled = state.applied; $("open").disabled = false; if (state.applied) status("Ya se cargó. Revisá el aviso en Facebook y publicá allí."); }
  catch (e) { $("product").textContent = "Sin publicación lista"; status(e.message, true); }
}
$("fill").addEventListener("click", async () => {
  $("fill").disabled = true; $("clear").disabled = true; $("warnings").replaceChildren(); status("Comprobando producto y cargando datos…");
  try {
    if ($("photos").checked && state.origins.length) { const granted = await chrome.permissions.request({ origins: state.origins }); if (!granted) throw new Error("Sin permiso para las fotos. Podés desmarcar Incluir fotos y cargarlas manualmente."); }
    const result = await send("PLUG_MARKETPLACE_FILL", { withPhotos: $("photos").checked, replace: $("replace").checked });
    status(result.message); for (const warning of result.warnings || []) { const li = document.createElement("li"); li.textContent = warning; $("warnings").append(li); }
    state.applied = true;
  } catch (e) { status(e.message, true); $("fill").disabled = false; }
  finally { $("clear").disabled = false; }
});
$("open").addEventListener("click", async () => { try { await send("PLUG_MARKETPLACE_OPEN"); } catch (e) { status(e.message, true); } });
$("clear").addEventListener("click", async () => { try { await send("PLUG_MARKETPLACE_CLEAR"); $("fill").disabled = true; $("open").disabled = true; $("product").textContent = "Sin publicación preparada"; $("warnings").replaceChildren(); status("Datos descartados. El formulario de Facebook no se modificó."); } catch (e) { status(e.message, true); } });
void init();
