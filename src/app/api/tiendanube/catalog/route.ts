import { NextResponse } from "next/server";
import { storeGuard, readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { parseCatalogChanges } from "@/lib/store-catalog-plan";
import { editStoreCatalog, listStoreCatalog } from "@/lib/store-catalog";
import { StoreApiError } from "@/lib/tiendanube-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof StoreApiError ? error.message : "No se pudo completar la edición. Reintentá el mismo lote para retomar el progreso guardado" }, { status: error instanceof StoreApiError ? error.status : 503, headers: PRIVATE_HEADERS });
}
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  const url = new URL(request.url); const page = Number(url.searchParams.get("page") || 1); const search = url.searchParams.get("q") || "";
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 || search.length > 200) return NextResponse.json({ error: "Búsqueda inválida" }, { status: 400, headers: PRIVATE_HEADERS });
  try { return NextResponse.json(await listStoreCatalog(page, search), { headers: PRIVATE_HEADERS }); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let body; let changes;
  try {
    body = await readStoreJson(request, 64 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Datos de edición inválidos");
    if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0 || typeof body.storeId !== "string" || !/^\d+$/.test(body.storeId)
      || typeof body.version !== "string" || !/^[a-f0-9]{64}$/.test(body.version)
      || typeof body.operationId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.operationId)) throw new Error("Producto o versión inválidos");
    changes = parseCatalogChanges(body.changes);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Datos inválidos" }, { status: 400, headers: PRIVATE_HEADERS }); }
  try { return NextResponse.json(await editStoreCatalog({ id: Number(body.id), storeId: String(body.storeId), version: String(body.version), operationId: String(body.operationId), changes }), { headers: PRIVATE_HEADERS }); }
  catch (e) { return failure(e); }
}
