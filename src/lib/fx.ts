import { FxRates } from "./types";

export interface LiveFx extends Partial<FxRates> {
  fetchedAt: string;
  error?: string;
}

// Dólar Argentina (blue/oficial/mep) desde dolarapi.com (gratis, sin API key, CORS habilitado)
const DOLARAPI_URL = "https://dolarapi.com/v1/dolares";
// CNY por USD desde open.er-api.com (gratis, sin API key, CORS habilitado)
const ER_API_URL = "https://open.er-api.com/v6/latest/USD";

export async function fetchLiveFx(): Promise<LiveFx> {
  const result: LiveFx = { fetchedAt: new Date().toISOString() };
  const errors: string[] = [];

  try {
    const res = await fetch(DOLARAPI_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`dolarapi ${res.status}`);
    const arr = (await res.json()) as Array<{ casa?: string; nombre?: string; venta?: number; compra?: number }>;
    const byCasa: Record<string, { venta?: number; compra?: number }> = {};
    for (const d of arr) {
      const key = (d.casa || d.nombre || "").toLowerCase();
      if (key) byCasa[key] = d;
    }
    const pick = (...keys: string[]): number | undefined => {
      for (const k of keys) {
        const d = byCasa[k];
        if (d) {
          const v = Number(d.venta ?? d.compra);
          if (v > 0) return v;
        }
      }
      return undefined;
    };
    const blue = pick("blue");
    const oficial = pick("oficial");
    const mep = pick("bolsa", "mep", "contadoconliqui");
    if (blue) result.blue = blue;
    if (oficial) result.oficial = oficial;
    if (mep) result.mep = mep;
  } catch (e) {
    errors.push(`dolarapi: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const res = await fetch(ER_API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`er-api ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const cny = data?.rates?.CNY;
    if (cny && cny > 0) result.cny = Number(cny);
  } catch (e) {
    errors.push(`er-api: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (errors.length && !result.blue && !result.cny) {
    result.error = errors.join("; ");
  }
  return result;
}
