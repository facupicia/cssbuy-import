import { NextResponse } from "next/server";
import { CALLBACK_PATH, consumeStoreOAuthState, finishStoreOAuth, OAUTH_COOKIE, panelOrigin } from "@/lib/store-oauth";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = panelOrigin(request);
  const redirect = (result: string) => {
    const response = NextResponse.redirect(`${origin}/configuracion?tiendanube=${result}`, 303);
    response.headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(OAUTH_COOKIE, "", { path: CALLBACK_PATH.slice(0, CALLBACK_PATH.lastIndexOf("/")), maxAge: 0 });
    return response;
  };
  const cookie = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1) ?? "";
  try {
    const app = await consumeStoreOAuthState(url.searchParams.get("state") ?? "", cookie);
    if (url.searchParams.has("error")) return redirect("cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 2048) return redirect("failed");
    await finishStoreOAuth(app, code);
    return redirect("connected");
  } catch { return redirect("failed"); }
}
