import { createHmac, timingSafeEqual } from "node:crypto";

export const STORE_COOKIE = "store_session";
export function storeSession(password: string, expires = Date.now() + 3_600_000) {
  return `${expires}.${createHmac("sha256", password).update(`store:${expires}`).digest("hex")}`;
}
/** Shared browser administration access. Integration bearer keys remain read only. */
export function storeAuthenticated(request: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) return false;
  const cookie = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${STORE_COOKIE}=`))?.slice(STORE_COOKIE.length + 1);
  if (!cookie) return false;
  const [expiry, signature, extra] = cookie.split(".");
  const expires = Number(expiry);
  if (extra || !/^\d+$/.test(expiry) || !/^[a-f0-9]{64}$/.test(signature ?? "") || expires <= Date.now() || expires > Date.now() + 3_600_000) return false;
  const expected = storeSession(password, expires);
  return cookie.length === expected.length && timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
