import { redirect } from "next/navigation";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import { getSessionUser, type AuthUser } from "@/lib/server/auth";

/**
 * Page-level guard for Server Components. Redirects anonymous users to
 * /login and other roles to their own workspace. This only controls
 * navigation — the API routes, database functions and RLS policies are
 * the actual security boundary.
 */
export async function requireRole(role: AppRole): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(ROLE_HOME[user.role]);
  return user;
}
