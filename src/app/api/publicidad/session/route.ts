import { NextResponse } from "next/server";
import { authorizeIntegration, PRIVATE_HEADERS } from "@/lib/integration-auth";
export { POST, DELETE } from "../../admin/session/route";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await authorizeIntegration(request);
  if (denied) return denied;
  return NextResponse.json({ authenticated: true }, { headers: PRIVATE_HEADERS });
}
