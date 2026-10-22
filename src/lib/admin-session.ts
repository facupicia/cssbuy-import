import { accountSessions } from "./auth";

/** Old shared-password cookies are deliberately no longer accepted. */
export async function storeAuthenticated(request: Request) {
  const session = await accountSessions.read(request);
  return session?.user.role === "admin";
}
