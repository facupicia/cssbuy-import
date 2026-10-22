import { NextResponse } from "next/server";
import { getInventoryItems, isPgConfigured } from "@/lib/db";
import { authorizeIntegration, PRIVATE_HEADERS } from "@/lib/integration-auth";
import { parseSellingCosts, productAdEconomics } from "@/lib/profitability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await authorizeIntegration(request);
  if (denied) return denied;
  let assumptions;
  try { assumptions = parseSellingCosts(new URL(request.url).searchParams); }
  catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!isPgConfigured()) {
    return NextResponse.json({ error: "Inventario pendiente de configurar." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  try {
    const products = (await getInventoryItems({ media: "none" })).map(item => productAdEconomics(item, assumptions));
    return NextResponse.json({ currency: "ARS", generatedAt: new Date().toISOString(), assumptions,
      scope: "Una unidad por pedido. Costos actuales; no representa ventas atribuidas ni ganancia neta.",
      products }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el inventario." }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
