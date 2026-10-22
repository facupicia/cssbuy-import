import { NextResponse } from "next/server";
import { authConfigured, getAuth, getUserSession, hasAccount } from "@/lib/auth";
import { isReportingOrigin, PRIVATE_HEADERS } from "@/lib/integration-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const configured = authConfigured();
    const session = configured ? await getUserSession(request) : null;
    return NextResponse.json({
      authenticated: session?.user.role === "admin", adminConfigured: configured,
      setupRequired: configured ? !await hasAccount() : false,
      user: session ? { name: session.user.name, email: session.user.email, role: session.user.role } : null,
    }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "No se pudo comprobar tu cuenta. Reintentá en unos instantes." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
// Compatibility aliases use the same account session; shared-key login is gone.
export async function POST(request: Request) {
  if (!isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: PRIVATE_HEADERS });
  return NextResponse.json({ error: "Iniciá sesión con tu email desde /ingresar" }, { status: 401, headers: PRIVATE_HEADERS });
}
export async function DELETE(request: Request) {
  if (!isReportingOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: PRIVATE_HEADERS });
  try {
    const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
    response.headers.set("Cache-Control", "private, no-store");
    // Clear obsolete cookies too, without accepting them as authentication.
    response.headers.append("Set-Cookie", "store_session=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax");
    response.headers.append("Set-Cookie", "reporting_session=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax");
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo cerrar la sesión. Reintentá." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
