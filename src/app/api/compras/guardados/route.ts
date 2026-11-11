import { NextResponse } from "next/server";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { storeGuard } from "@/lib/store-auth";
import { getCotizaciones, getCssbuyOrders, getInventoryItems, rowToCssbuyOrder } from "@/lib/db";
import { readSuppliers } from "@/lib/suppliers-db";
import { readPlans } from "@/lib/purchase-plans-db";
import { SOURCE_LABELS, sourceLinks, type SavedLinkSource, type SavedProductLink } from "@/lib/purchase-plan-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  const sources: { source: SavedLinkSource; read: () => Promise<unknown[]> }[] = [
    { source: "proveedores", read: readSuppliers },
    { source: "inventario", read: () => getInventoryItems({ media: "urls" }) },
    { source: "cssbuy", read: async () => (await getCssbuyOrders()).map(rowToCssbuyOrder) },
    { source: "cotizaciones", read: getCotizaciones },
    { source: "pedidos", read: readPlans },
  ];
  const results = await Promise.allSettled(sources.map(async item => sourceLinks(item.source, await item.read())));
  const links: SavedProductLink[] = [], warnings: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") links.push(...result.value);
    else warnings.push(`No se pudo cargar ${SOURCE_LABELS[sources[index].source].toLocaleLowerCase("es")}. Podés reintentar; las otras fuentes siguen disponibles.`);
  });
  return NextResponse.json({ links, warnings }, { status: results.every(result => result.status === "rejected") ? 503 : 200, headers: PRIVATE_HEADERS });
}
