import { NextResponse } from "next/server";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { storeAuthenticated } from "@/lib/store-auth";
import { hasStoreCredentials, loadStoreCredentials } from "@/lib/store-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const authenticated = await storeAuthenticated(request);
  let connection = null;
  let configured = false;
  try {
    if (authenticated) { connection = await loadStoreCredentials(); configured = Boolean(connection); }
    else configured = await hasStoreCredentials();
  } catch { /* The private settings endpoint provides recovery guidance. */ }
  return NextResponse.json({ configured, authenticated,
    ...(authenticated && connection ? { storeId: connection.storeId } : {}),
    adminConfigured: (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12 }, { headers: PRIVATE_HEADERS });
}
export { POST, DELETE } from "../../admin/session/route";
