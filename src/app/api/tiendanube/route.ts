import { NextResponse } from "next/server";
import { storeGuard, readStoreJson } from "@/lib/store-auth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { getStoreCategories, getStoreLinks, StoreApiError, syncStoreProduct } from "@/lib/tiendanube-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof StoreApiError ? error.message : "No se pudo completar la operación. Revisá la conexión y volvé a intentar" },
    { status: error instanceof StoreApiError ? error.status : 500, headers: PRIVATE_HEADERS });
}
export async function GET(request: Request) {
  const denied = storeGuard(request);
  if (denied) return denied;
  try {
    if (new URL(request.url).searchParams.get("resource") === "categories") return NextResponse.json({ categories: await getStoreCategories() }, { headers: PRIVATE_HEADERS });
    return NextResponse.json({ links: await getStoreLinks() }, { headers: PRIVATE_HEADERS });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  const denied = storeGuard(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await readStoreJson(request); }
  catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 }); }
  if (typeof body.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)
    || typeof body.publish !== "boolean" || typeof body.updatedAt !== "string"
    || (body.productId !== undefined && (typeof body.productId !== "string" || !/^\d+$/.test(body.productId)))) {
    return NextResponse.json({ error: "Producto, versión o acción inválida" }, { status: 400 });
  }
  try {
    return NextResponse.json(await syncStoreProduct(body.id, body.publish, body.updatedAt, body.productId as string | undefined), { headers: PRIVATE_HEADERS });
  } catch (e) { return failure(e); }
}
