import { NextResponse } from "next/server";
import { storeAuthenticated } from "@/lib/admin-session";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";

export { POST, DELETE } from "../../tiendanube/session/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return NextResponse.json({ authenticated: storeAuthenticated(request), adminConfigured: (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12 }, { headers: PRIVATE_HEADERS });
}
