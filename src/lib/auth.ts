import { createHmac } from "node:crypto";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { getPool, isPgConfigured } from "./db";

export function authConfigured() {
  return isPgConfigured() && (process.env.BETTER_AUTH_SECRET ? process.env.BETTER_AUTH_SECRET.length >= 32 : (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12);
}

function authSecret() {
  if (process.env.BETTER_AUTH_SECRET) {
    if (process.env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET debe tener al menos 32 caracteres");
    return process.env.BETTER_AUTH_SECRET;
  }
  if ((process.env.ADMIN_PASSWORD?.length ?? 0) < 12) throw new Error("Falta configurar el secreto de acceso");
  // Domain separation preserves existing installations without changing the
  // ADMIN_PASSWORD encryption key used for Tiendanube credentials.
  return createHmac("sha256", process.env.ADMIN_PASSWORD!).update("PLUG:account-sessions:v1").digest("hex");
}

export function createAuth(bootstrap = false) {
  const origin = process.env.BUSINESS_APP_ORIGIN || "http://localhost:3001";
  return betterAuth({
    appName: "PLUG", baseURL: origin, secret: authSecret(), database: getPool(), trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true, disableSignUp: !bootstrap, autoSignIn: false,
      minPasswordLength: 12, maxPasswordLength: 128,
    },
    user: {
      modelName: "plug_user",
      additionalFields: {
        // No public user creation. Future invitations must assign explicit roles.
        role: { type: "string", defaultValue: "admin", required: true, input: false },
      },
    },
    account: { modelName: "plug_account" },
    verification: { modelName: "plug_verification" },
    session: {
      modelName: "plug_session", expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60, cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: "plug", useSecureCookies: origin.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    rateLimit: {
      enabled: true, storage: "database", modelName: "plug_rate_limit", window: 60, max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    logger: { level: "error" },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return auth ??= createAuth(); }

let schema: Promise<void> | undefined;
export async function ensureAuthSchema() {
  if (!schema) schema = (async () => {
    const client = await getPool().connect();
    try {
      // Serialize additive migrations across containers and concurrent requests.
      await client.query("SELECT pg_advisory_lock(73428001)");
      const { runMigrations } = await getMigrations(getAuth().options);
      await runMigrations();
      await client.query(`CREATE TABLE IF NOT EXISTS plug_access_attempts (
        key TEXT PRIMARY KEY, attempts INTEGER NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    } finally {
      try { await client.query("SELECT pg_advisory_unlock(73428001)"); }
      finally { client.release(); }
    }
  })().catch(error => { schema = undefined; throw error; });
  return schema;
}

export async function hasAccount() {
  await ensureAuthSchema();
  const result = await getPool().query("SELECT 1 FROM plug_user LIMIT 1");
  return result.rows.length > 0;
}

export async function getUserSession(request: Request) {
  if (!authConfigured() || !request.headers.get("cookie")?.includes("plug.session_token=")) return null;
  await ensureAuthSchema();
  return getAuth().api.getSession({ headers: request.headers, query: { disableRefresh: true } });
}

export const accountSessions = { read: getUserSession };

/** A small shared limit also works when forwarded IP headers are unavailable. */
export async function accessAttemptAllowed(key: "bootstrap" | "login", maximum: number) {
  const result = await getPool().query(`INSERT INTO plug_access_attempts (key,attempts) VALUES ($1,1)
    ON CONFLICT (key) DO UPDATE SET
      attempts=CASE WHEN plug_access_attempts.started_at < now()-interval '1 minute' THEN 1 ELSE plug_access_attempts.attempts+1 END,
      started_at=CASE WHEN plug_access_attempts.started_at < now()-interval '1 minute' THEN now() ELSE plug_access_attempts.started_at END
    RETURNING attempts`, [key]);
  return result.rows[0].attempts <= maximum;
}
