// The API layer talks to the database only through Postgres functions.
// Abstracting the call lets tests run the exact same handlers against a
// real Postgres (PGlite) with the real migrations.

export type RpcError = { code: string; message: string };

export type RpcResult<T> =
  | { data: T; error: null }
  | { data: null; error: RpcError };

export type RpcClient = <T>(
  fn: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult<T>>;
