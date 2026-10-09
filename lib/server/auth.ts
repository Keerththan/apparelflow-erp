import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { isAppRole, type AppRole } from "@/lib/roles";
import type { RpcClient } from "@/lib/server/rpc";
import { createClient as createCookieClient } from "@/utils/supabase/server";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
};

export type AuthContext = {
  user: AuthUser;
  rpc: RpcClient;
};

function bearerToken(request?: Request): string | null {
  const header = request?.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function clientForToken(token: string): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function rpcFromSupabase(supabase: SupabaseClient): RpcClient {
  return async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args ?? {});
    if (error) {
      return { data: null, error: { code: error.code, message: error.message } };
    }
    return { data: data as never, error: null };
  };
}

/**
 * Resolves the caller from the request — a Bearer token (Postman/cURL)
 * or the Supabase session cookie (browser). The identity is the verified
 * JWT subject and the role is read from public.profiles; nothing is taken
 * from the request body. Returns null when unauthenticated or role-less.
 */
export async function getAuthContext(
  request?: Request,
): Promise<AuthContext | null> {
  const token = bearerToken(request);
  const supabase: SupabaseClient = token
    ? clientForToken(token)
    : (createCookieClient(await cookies()) as unknown as SupabaseClient);

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims(token ?? undefined);
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !isAppRole(profile.role)) return null;

  return {
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
    },
    rpc: rpcFromSupabase(supabase),
  };
}

/** Cookie-based session for Server Components, memoised per request. */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const ctx = await getAuthContext();
  return ctx?.user ?? null;
});
