import { hashPassword } from "better-auth/crypto";
import { getPool } from "./db";

/** Maintenance only. Never expose this operation through a public endpoint. */
export async function recoverAccount(email: string, password: string) {
  if (password.length < 12 || password.length > 128) throw new Error("Usá una contraseña de 12 a 128 caracteres.");
  const hashed = await hashPassword(password);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM plug_user WHERE email=$1 FOR UPDATE", [email.trim().toLowerCase()]);
    if (user.rows.length !== 1) throw new Error("No se encontró esa cuenta.");
    const updated = await client.query('UPDATE plug_account SET password=$1, "updatedAt"=now() WHERE "userId"=$2 AND "providerId"=\'credential\' RETURNING id', [hashed, user.rows[0].id]);
    if (updated.rowCount !== 1) throw new Error("No se encontró el acceso con contraseña de esa cuenta.");
    await client.query('DELETE FROM plug_session WHERE "userId"=$1', [user.rows[0].id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
