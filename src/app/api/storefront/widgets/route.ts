import { NextResponse } from "next/server";
import { readWidgets, widgetStoreId } from "@/lib/store-widgets-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=30, stale-while-revalidate=30", "X-Content-Type-Options": "nosniff" };
let lastBrowserLog = 0;
export async function GET(request: Request) {
  try {
    const storeId = new URL(request.url).searchParams.get("store");
    if (!storeId || storeId !== await widgetStoreId()) return NextResponse.json({ widgets: [] }, { status: 404, headers });
    const { published } = await readWidgets(storeId);
    // Diagnose browser delivery without logging customers, IPs, headers or configuration content.
    if (request.headers.has("origin") && Date.now() - lastBrowserLog > 60_000) {
      lastBrowserLog = Date.now();
      console.info("[PLUG storefront] browser requested public configuration");
    }
    return NextResponse.json(published ?? { widgets: [], accent: "#181818" }, { headers });
  } catch { return NextResponse.json({ widgets: [] }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } }); }
}
