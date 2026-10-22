import { NextRequest, NextResponse } from "next/server";
import { authConfigured, ensureAuthSchema, getAuth } from "@/lib/auth";

const publicAssets = new Set([
  "/plug-cssbuy-connector.zip", "/plug-storefront.min.js", "/plug-storefront-theme.css",
  "/storefront-carousel.html", "/storefront-video.html",
]);

/** Pages are checked here; every private API also checks its own authorization. */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname === "/ingresar" || publicAssets.has(request.nextUrl.pathname)) return NextResponse.next();
  try {
    if (authConfigured() && request.headers.get("cookie")?.includes("plug.session_token=")) {
      await ensureAuthSchema();
      const { response: session, headers } = await getAuth().api.getSession({ headers: request.headers, returnHeaders: true });
      if (session?.user.role === "admin") {
        const response = NextResponse.next();
        for (const cookie of headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    }
  } catch { /* Fail closed; the login screen offers a retry without leaking errors. */ }
  const url = request.nextUrl.clone();
  url.pathname = "/ingresar";
  url.search = "";
  url.searchParams.set("volver", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
