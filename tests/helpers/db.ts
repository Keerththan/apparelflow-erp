import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { AppRole } from "@/lib/roles";
import type { AuthContext } from "@/lib/server/auth";
import type { RpcClient } from "@/lib/server/rpc";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

export const USERS = {
  cutting_supervisor: "00000000-0000-4000-8000-000000000001",
  cutting_verifier: "00000000-0000-4000-8000-000000000002",
  sewing_supervisor: "00000000-0000-4000-8000-000000000003",
} as const satisfies Record<AppRole, string>;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Fresh Postgres with Supabase stubs + every migration + seeded demo users.
 */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  for (const [role, id] of Object.entries(USERS)) {
    await db.query(
      `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('role', $3::text),
               jsonb_build_object('full_name', $4::text))`,
      [id, `${role}@test.local`, role, `Test ${role}`],
    );
  }
  return db;
}

/** Runs `fn` as the Postgres `authenticated` role with the given JWT subject. */
export async function asUser<T>(
  db: PGlite,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("set role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/** Same contract as supabase.rpc(): calls public.<fn>(named args) as the user. */
export function pgRpc(db: PGlite, userId: string): RpcClient {
  return async (fn, args = {}) => {
    const names = Object.keys(args);
    if (!IDENTIFIER.test(fn) || !names.every((n) => IDENTIFIER.test(n))) {
      throw new Error(`Invalid rpc identifier: ${fn}`);
    }
    const argList = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
    const { rows: meta } = await db.query<{ proretset: boolean }>(
      `select proretset from pg_proc
        where proname = $1 and pronamespace = 'public'::regnamespace`,
      [fn],
    );

    try {
      const rows = await asUser(db, userId, async () => {
        const result = await db.query<{ j: unknown }>(
          `select to_jsonb(r) as j from public.${fn}(${argList}) r`,
          names.map((n) => args[n]),
        );
        return result.rows.map((row) => row.j);
      });
      const data = meta[0]?.proretset ? rows : (rows[0] ?? null);
      return { data: data as never, error: null };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return {
        data: null,
        error: { code: err.code ?? "UNKNOWN", message: err.message ?? String(e) },
      };
    }
  };
}

/** AuthContext as getAuthContext() would build it for a seeded user. */
export function contextFor(db: PGlite, role: AppRole): AuthContext {
  const id = USERS[role];
  return {
    user: { id, email: `${role}@test.local`, fullName: `Test ${role}`, role },
    rpc: pgRpc(db, id),
  };
}

export async function recipeId(db: PGlite, code: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.recipes where recipe_code = $1",
    [code],
  );
  return rows[0].id;
}
