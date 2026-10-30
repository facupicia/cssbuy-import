import { NextResponse } from "next/server";
import { storeGuard, readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { getInventorySalesReport, recordInventorySale } from "@/lib/inventory-sales-db";
import { InventorySaleError } from "@/lib/inventory-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof InventorySaleError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS });
  console.error("Error en ventas de inventario:", error);
  return NextResponse.json({ error: "No se pudo acceder al registro de ventas. Volvé a intentar." }, { status: 500, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try { return NextResponse.json(await getInventorySalesReport(new URL(request.url).searchParams.get("mes") || ""), { headers: PRIVATE_HEADERS }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let body;
  try { body = await readStoreJson(request); if (!body || Array.isArray(body) || typeof body !== "object") throw new Error("Solicitud inválida"); }
  catch { return NextResponse.json({ error: "Revisá los datos de la venta." }, { status: 400, headers: PRIVATE_HEADERS }); }
  try { await recordInventorySale(body); return NextResponse.json({ success: true }, { headers: PRIVATE_HEADERS }); }
  catch (error) { return failure(error); }
}
