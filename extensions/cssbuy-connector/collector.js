// Se ejecuta en CSSBuy. La sesión permanece en CSSBuy: solo retorna datos de pedidos y movimientos.
async function collectCssbuy() {
  if (location.origin !== "https://www.cssbuy.com") throw new Error("Abrí CSSBuy para sincronizar.");
  const token = localStorage.getItem("css-token");
  if (!token) throw new Error("Iniciá sesión en CSSBuy y volvé a sincronizar.");
  const headers = { Authorization: "Bearer " + token, Accept: "application/json", Lang: "en",
    "Device-Id": localStorage.getItem("device_id") || "", "Kb-referer": location.href };
  async function pages(kind) {
    const all = []; let previous = "";
    for (let page = 1; page <= 100; page++) {
      const records = kind === "records";
      const form = new FormData();
      if (records) for (const [key, value] of Object.entries({ type: 0, query: "", pageSize: 100, pageNum: page, sTime: "", eTime: "", lang: "en" })) form.append(key, String(value));
      const response = await fetch(records ? "/api/v2/user/record" : `/api/v3/user/order?page=${page}&pageSize=100`, {
        method: records ? "POST" : "GET", credentials: "include", redirect: "error",
        headers,
        ...(records ? { body: form } : {}),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "La sesión de CSSBuy venció. Volvé a iniciar sesión." : `CSSBuy no permitió leer ${records ? "los movimientos" : "los pedidos"} (HTTP ${response.status}).`);
      let data;
      try { data = await response.json(); } catch { throw new Error("CSSBuy pide verificar la sesión en su pestaña. Completá la verificación y reintentá."); }
      if (data.code !== 0) throw new Error("CSSBuy no aceptó la consulta. Revisá tu sesión en su pestaña.");
      const body = data.data;
      const list = Array.isArray(body) ? body : body?.records ?? body?.list;
      if (!Array.isArray(list)) throw new Error("CSSBuy cambió el formato de los datos. Hay que actualizar el conector.");
      if (!list.length) return all;
      const signature = JSON.stringify(list);
      if (signature === previous) throw new Error("CSSBuy repitió una página. La sincronización se detuvo para evitar datos incompletos.");
      previous = signature; all.push(...list);
      const total = Array.isArray(body) ? 0 : Number(body.total ?? body.count ?? 0);
      if (list.length < 100 || (total > 0 && all.length >= total)) return all;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("La cuenta supera el límite de esta sincronización. No se enviaron datos incompletos.");
  }
  const orders = await pages("orders");
  try { return { orders, records: await pages("records"), recordsError: null }; }
  catch { return { orders, records: null, recordsError: "Los pedidos se actualizaron, pero no se pudieron leer los movimientos. Los anteriores se conservan." }; }
}
