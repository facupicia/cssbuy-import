import { NextResponse } from "next/server";
import { readStoreJson, storeGuard } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { StoreApiError, syncStorePhotos } from "@/lib/tiendanube-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await readStoreJson(request, 2048); }
  catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400, headers: PRIVATE_HEADERS }); }
  if (!body || typeof body.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)
    || typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))
    || typeof body.storeId !== "string" || !/^\d+$/.test(body.storeId)
    || typeof body.productId !== "string" || !/^\d+$/.test(body.productId)
    || (body.linkExisting !== undefined && typeof body.linkExisting !== "boolean")
    || Object.keys(body).some(key => !["id", "updatedAt", "storeId", "productId", "linkExisting"].includes(key))) {
    return NextResponse.json({ error: "Producto, versión o vínculo inválido" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  try {
    return NextResponse.json(await syncStorePhotos(body.id, body.updatedAt, body.productId, body.storeId, body.linkExisting === true), { headers: PRIVATE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof StoreApiError ? error.message : "No se pudieron completar las fotos. Revisá el producto y reintentá; se conservan los envíos ya realizados." },
      { status: error instanceof StoreApiError ? error.status : 503, headers: PRIVATE_HEADERS });
  }
}
