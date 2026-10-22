import { NextResponse } from "next/server";
import { authorizeIntegration, PRIVATE_HEADERS } from "@/lib/integration-auth";
import { getMetaCampaignReport, parseReportRange } from "@/lib/meta-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await authorizeIntegration(request);
  if (denied) return denied;
  let range;
  try { range = parseReportRange(new URL(request.url).searchParams); }
  catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400, headers: PRIVATE_HEADERS });
  }
  try {
    const campaigns = await getMetaCampaignReport(range);
    return NextResponse.json({ range, generatedAt: new Date().toISOString(), campaigns,
      attribution: "Configuración de atribución de cada conjunto. Compras del sitio web informadas por Meta.",
      warning: "Las ventas acumuladas del inventario no se atribuyen a campañas. No se calcula ganancia neta sin vincular pedidos y costos históricos." },
      { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "No se pudo obtener el reporte. Revisá la configuración de Meta, los permisos y la vigencia del token." },
      { status: 502, headers: PRIVATE_HEADERS });
  }
}
