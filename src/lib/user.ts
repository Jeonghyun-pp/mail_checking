import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySessionToken } from "./session-token";

/**
 * This is a single-team internal tool: every teammate shares one workspace.
 * `getAuthUser()` returns the individual signed-in person (used for auth,
 * roles, and the account UI), while `getCurrentUser()` returns the shared
 * workspace user that ALL data is filed under — so every teammate sees and
 * edits the same leads, campaigns, CRM and mailboxes.
 */

/** The individual signed-in user, resolved from the session cookie. */
export async function getAuthUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Backwards-compatible alias used by the /api/auth/me endpoint. */
export const getOptionalUser = getAuthUser;

/** The signed-in user, or throw — for routes that need the real identity. */
export async function requireAuthUser(): Promise<User> {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized: no valid session");
  return user;
}

let workspaceUserCache: User | null = null;

/**
 * The shared workspace owner — the anchor every record is filed under.
 * Exported so cookie-less contexts (the MCP server) can scope data too.
 */
export async function getWorkspaceUser(): Promise<User> {
  if (workspaceUserCache) return workspaceUserCache;
  const user = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!user) throw new Error("No workspace admin user exists");
  workspaceUserCache = user;
  return user;
}

/**
 * The workspace user that data is scoped to. Requires a valid session
 * (gated further by `proxy.ts`), then returns the shared workspace owner so
 * all teammates operate on one shared dataset.
 */
export async function getCurrentUser(): Promise<User> {
  const auth = await getAuthUser();
  if (!auth) throw new Error("Unauthorized: no valid session");
  return getWorkspaceUser();
}
