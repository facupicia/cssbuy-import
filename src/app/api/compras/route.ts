import { NextResponse } from "next/server";
import { PRIVATE_HEADERS } from "@/lib/integration-auth";
import { readStoreJson, storeGuard } from "@/lib/store-auth";
import { parsePlan, planIdentity } from "@/lib/purchase-plans";
import { createPlan, readPlans, updatePlan } from "@/lib/purchase-plans-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export async function GET(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  try { return reply({ pedidos: await readPlans() }); }
  catch { return reply({ error: "No se pudieron cargar los próximos pedidos. Reintentá en unos segundos." }, 503); }
}
async function write(request: Request) {
  const denied = await storeGuard(request); if (denied) return denied;
  let input, identity;
  try {
    const body = await readStoreJson(request, 400_000);
    input = parsePlan(body);
    if (request.method === "PATCH") identity = planIdentity(body);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "Revisá los datos del pedido." }, 400); }
  try {
    if (!identity) return reply({ pedido: await createPlan(input) }, 201);
    const pedido = await updatePlan(identity.id, identity.version, input);
    return pedido ? reply({ pedido }) : reply({ error: "Este pedido cambió en otra pestaña. Tus cambios siguen en pantalla: copiá las notas que necesites y volvé a abrirlo antes de guardar." }, 409);
  } catch { return reply({ error: "No se pudo guardar el pedido. Tus cambios siguen en pantalla." }, 503); }
}
export const POST = write;
export const PATCH = write;
