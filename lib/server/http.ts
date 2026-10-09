import type { RpcError } from "@/lib/server/rpc";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): Response {
  return json({ error, ...details }, status);
}

export const unauthorized = () =>
  errorResponse(401, "Authentication required");

export const forbidden = (message = "Your role is not allowed to do this") =>
  errorResponse(403, message);

/**
 * Maps database errors to HTTP. Custom SQLSTATEs are raised by the
 * migrations' functions and triggers; 42501 is a Postgres privilege error.
 */
const STATUS_BY_SQLSTATE: Record<string, number> = {
  AF403: 403,
  "42501": 403,
  AF404: 404,
  AF409: 409,
  AF422: 422,
  "23514": 422, // check_violation
  "22P02": 422, // invalid_text_representation (e.g. bad uuid)
};

export function rpcErrorResponse(error: RpcError): Response {
  const status = STATUS_BY_SQLSTATE[error.code];
  if (status) return errorResponse(status, error.message, { code: error.code });
  console.error("Unexpected database error", error);
  return errorResponse(500, "Unexpected server error");
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
