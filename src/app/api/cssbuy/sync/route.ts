import { NextRequest, NextResponse } from "next/server";
import { syncCssbuyOrders, rawItemsToRows } from "@/lib/cssbuy-sync";
import { isPgConfigured, getCssbuyOrders, rowToCssbuyOrder, upsertCssbuyOrders, ensureCssbuyOrdersTable } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min: la 1ª corrida puede requerir login manual con captcha

let running = false;

export async function GET() {
  if (!isPgConfigured()) {
    return NextResponse.json({ ok: false, orders: [], message: "Postgres no configurado" });
  }
  try {
    const rows = await getCssbuyOrders();
    const orders = rows.map(rowToCssbuyOrder);
    return NextResponse.json({ ok: true, orders, total: orders.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, orders: [], message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPgConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Postgres no configurado. Completá PGHOST/PGUSER/PGPASSWORD/PGDATABASE en .env.local" },
      { status: 500 }
    );
  }

  let startDate: string | undefined;
  let endDate: string | undefined;

  // Check if the request has a JSON body with orders (upload mode) or sync options (startDate, endDate)
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      if (body && typeof body === "object") {
        if (typeof body.startDate === "string") startDate = body.startDate;
        if (typeof body.endDate === "string") endDate = body.endDate;
      }

      const rawList = Array.isArray(body)
        ? body
        : body.orders || body.list || body.data?.list || body.data?.orders || (Array.isArray(body.data) ? body.data : []);

      if (Array.isArray(rawList) && rawList.length > 0) {
        // Import uploaded orders directly into DB
        await ensureCssbuyOrdersTable();
        const rows = rawItemsToRows(rawList);
        const { inserted, updated } = await upsertCssbuyOrders(rows);

        // Return all orders from DB
        const allRows = await getCssbuyOrders();
        const orders = allRows.map(rowToCssbuyOrder);
        return NextResponse.json({
          ok: true,
          total: orders.length,
          inserted,
          updated,
          message: `Importación directa: ${rows.length} órdenes procesadas (${inserted} nuevas, ${updated} actualizadas)`,
          orders,
        });
      }
    } catch {
      // Not valid JSON body, fall through to sync mode
    }
  }

  // Sync mode: scrape CSSBuy
  if (running) {
    return NextResponse.json(
      { ok: false, message: "Ya hay una sincronización en curso. Esperá a que termine." },
      { status: 409 }
    );
  }

  running = true;
  const logs: string[] = [];
  const log = (m: string) => {
    logs.push(m);
    console.log(`[cssbuy-sync] ${m}`);
  };

  try {
    const result = await syncCssbuyOrders({ startDate, endDate }, log);
    const rows = await getCssbuyOrders();
    const orders = rows.map(rowToCssbuyOrder);
    return NextResponse.json({ ...result, logs, orders });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`ERROR: ${message}`);
    return NextResponse.json({ ok: false, message, logs }, { status: 500 });
  } finally {
    running = false;
  }
}
