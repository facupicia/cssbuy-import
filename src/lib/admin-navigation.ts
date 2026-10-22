/** Only return to a known app screen; never redirect to an external URL. */
export function adminReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://panel.local");
    if (url.origin !== "https://panel.local" || !["/", "/configuracion", "/inventario", "/cotizaciones", "/calculadora/proveedores", "/publicidad", "/tienda", "/tiendanube/publicar", "/tiendanube/catalogo"].includes(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
