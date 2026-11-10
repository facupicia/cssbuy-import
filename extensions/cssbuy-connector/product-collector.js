/* Read-only: structured product metadata from the exact product tab the user requested. */
function collectCssbuyProduct() {
  const nodes = [];
  function visit(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 8 || nodes.length > 300) return;
    if (Array.isArray(value)) { for (const item of value.slice(0, 100)) visit(item, depth + 1); return; }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.includes("Product")) nodes.push(value);
    if (value["@graph"]) visit(value["@graph"], depth + 1);
    if (value.mainEntity) visit(value.mainEntity, depth + 1);
  }
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20)) {
    if ((script.textContent || "").length > 500000) continue;
    try { visit(JSON.parse(script.textContent)); } catch { /* Not valid product metadata. */ }
  }
  // A collection or several product recommendations is ambiguous; never select one arbitrarily.
  const product = nodes.length === 1 ? nodes[0] : null;
  const nombre = (typeof product?.name === "string" ? product.name : "").trim().slice(0, 200);
  const offers = product?.offers ? (Array.isArray(product.offers) ? product.offers : [product.offers]) : [];
  const prices = offers.filter(offer => offer && String(offer.priceCurrency).toUpperCase() === "CNY" && offer.price !== undefined)
    .map(offer => Number(offer.price)).filter(price => Number.isFinite(price) && price > 0 && price <= 1000000);
  // Do not treat lowPrice, highPrice, dollar display, or unrelated amounts as a unit price.
  const precioCNY = prices.length === offers.length && prices.length > 0 && new Set(prices).size === 1 ? prices[0] : null;
  if (!nombre && precioCNY === null) throw new Error("La ficha no expone datos de producto que podamos leer con seguridad. Esperá a que cargue o completá nombre y precio a mano.");
  return { url: location.href, nombre, precioCNY };
}
