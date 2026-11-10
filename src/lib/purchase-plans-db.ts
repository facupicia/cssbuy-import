import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import type { PlanInput, PurchasePlan } from "./purchase-plans";

let schema: Promise<unknown> | undefined;
async function ensure() {
  schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS purchase_plans (
    id UUID PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).catch(error => { schema = undefined; throw error; });
  await schema;
}
function plan(row: { id: string; data: PlanInput; version: number; created_at: Date; updated_at: Date }): PurchasePlan {
  return { ...row.data, id: row.id, version: row.version, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
export async function readPlans() {
  await ensure();
  return (await getPool().query("SELECT * FROM purchase_plans ORDER BY updated_at DESC, id")).rows.map(plan);
}
export async function createPlan(input: PlanInput) {
  await ensure();
  return plan((await getPool().query("INSERT INTO purchase_plans(id,data) VALUES($1,$2) RETURNING *", [randomUUID(), JSON.stringify(input)])).rows[0]);
}
export async function updatePlan(id: string, version: number, input: PlanInput) {
  await ensure();
  const result = await getPool().query("UPDATE purchase_plans SET data=$1,version=version+1,updated_at=now() WHERE id=$2 AND version=$3 RETURNING *", [JSON.stringify(input), id, version]);
  return result.rows.length ? plan(result.rows[0]) : null;
}
