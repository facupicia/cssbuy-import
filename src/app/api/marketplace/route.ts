import { NextResponse } from "next/server";
import { accountSessions } from "@/lib/auth";
import { isReportingOrigin, PRIVATE_HEADERS } from "@/lib/integration-auth";
import { readStoreJson } from "@/lib/store-auth";
import { marketplaceUuid, parseMarketplaceInput, type MarketplaceStatus } from "@/lib/marketplace";
import { MarketplaceError, marketplaceRateLimit, marketplaceWorkspace, saveMarketplaceDraft, exportMarketplaceDraft, setMarketplaceStatus } from "@/lib/marketplace-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
async function owner(request: Request) {
  const session = await accountSessions.read(request);
  return session?.user.role === "admin" ? session.user.id : null;
}
function failure(e: unknown) {
  if (e instanceof MarketplaceError) return json({ error: e.message }, e.status);
  if ((e as { code?: string }).code === "23505") return json({ error: "Ese enlace ya está asociado a otro producto." }, 409);
  return json({ error: "No se pudo completar la operación. Reintentá." }, 503);
}
export async function GET(request: Request) {
  try {
    const user = await owner(request); if (!user) return json({ error: "Iniciá sesión para abrir Marketplace." }, 401);
    return json(await marketplaceWorkspace(user));
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!isReportingOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  try {
    const user = await owner(request); if (!user) return json({ error: "Iniciá sesión para usar Marketplace." }, 401);
    await marketplaceRateLimit(user);
    let b: Record<string, unknown>;
    try { b = await readStoreJson(request, 16384); if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error(); }
    catch { return json({ error: "La solicitud no es válida o supera el tamaño permitido." }, 400); }
    if (b.action === "save") {
      let input; try { input = parseMarketplaceInput(b.draft); } catch (e) { return json({ error: (e as Error).message }, 400); }
      if (typeof b.revision !== "number") return json({ error: "Falta la versión del borrador." }, 400);
      return json({ draft: await saveMarketplaceDraft(user, input, b.revision) });
    }
    if (!marketplaceUuid(b.itemId) || !Number.isSafeInteger(b.revision) || Number(b.revision) < 1) return json({ error: "Producto o versión no válidos." }, 400);
    if (b.action === "export") return json({ payload: await exportMarketplaceDraft(user, b.itemId, Number(b.revision)) });
    if (b.action === "status" && ["draft", "sent", "published", "sold", "archived"].includes(String(b.status))) {
      try { return json({ draft: await setMarketplaceStatus(user, b.itemId, Number(b.revision), b.status as MarketplaceStatus, b.listingUrl) }); }
      catch (e) { if (e instanceof MarketplaceError || (e as { code?: string }).code) throw e; return json({ error: (e as Error).message }, 400); }
    }
    return json({ error: "Acción no válida." }, 400);
  } catch (e) { return failure(e); }
}
