import type { TestContext } from "node:test";
import { accountSessions } from "../../src/lib/auth";

/** Business tests isolate authentication; auth.integration tests use real PG. */
export function mockAccount(t: TestContext) {
  const cookie = "plug.session_token=test-account-session";
  t.mock.method(accountSessions, "read", async (request: Request) =>
    request.headers.get("cookie") === cookie ? { user: { id: "test-user", role: "admin" } } : null);
  return cookie;
}
