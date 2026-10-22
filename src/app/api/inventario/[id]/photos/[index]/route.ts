import { NextResponse } from "next/server";
import { storeGuard } from "@/lib/store-auth";
import { getInventoryPhoto } from "@/lib/db";
import { imageTag, inventoryImage } from "@/lib/inventory-image";
import { validPhoto } from "@/lib/store-product";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const denied = await storeGuard(request); if (denied) return denied;
  const { id, index } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || !/^[0-8]$/.test(index)) return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
  try {
    const photo = await getInventoryPhoto(id, Number(index));
    if (!photo?.source || !validPhoto(photo.source)) return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
    const url = new URL(request.url);
    const headers = {
      "Cache-Control": url.searchParams.get("v") === new Date(photo.updated_at).toISOString() ? "private, max-age=86400" : "private, no-cache",
      "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
    };
    // External images stay external; never fetch arbitrary URLs from this server.
    if (!photo.source.startsWith("data:")) return new NextResponse(null, { status: 302, headers: { ...headers, Location: photo.source } });
    const thumb = url.searchParams.get("size") === "thumb";
    const tag = imageTag(photo.source, thumb);
    if (request.headers.get("if-none-match") === tag) return new NextResponse(null, { status: 304, headers: { ...headers, ETag: tag } });
    const image = await inventoryImage(photo.source, thumb);
    if (!image) return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
    return new NextResponse(new Uint8Array(image.bytes), { headers: { ...headers, "Content-Type": image.type, "Content-Length": String(image.bytes.length), ETag: tag } });
  } catch {
    return new NextResponse(null, { status: 503, headers: PRIVATE_HEADERS });
  }
}
