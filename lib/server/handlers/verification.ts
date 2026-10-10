import {
  parseRejectionNote,
  parseUuid,
  validateCounts,
} from "@/lib/domain/validation";
import type { AuthContext } from "@/lib/server/auth";
import {
  errorResponse,
  forbidden,
  json,
  rpcErrorResponse,
  unauthorized,
} from "@/lib/server/http";

// The verifier's identity and the decision timestamp are taken from the
// session inside the database (auth.uid(), now()). Any verifierId or
// timestamp in the request body is ignored.

type Body = Record<string, unknown>;

function asBody(body: unknown): Body {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Body)
    : {};
}

type Guarded =
  | { ok: false; response: Response }
  | { ok: true; ctx: AuthContext; orderId: string };

function guard(ctx: AuthContext | null, orderId: string): Guarded {
  if (!ctx) return { ok: false, response: unauthorized() };
  if (ctx.user.role !== "cutting_verifier") {
    return {
      ok: false,
      response: forbidden("Only a cutting verifier can verify batches"),
    };
  }
  const id = parseUuid(orderId, "Order ID");
  if (!id.ok) {
    return { ok: false, response: errorResponse(404, "Cutting order not found") };
  }
  return { ok: true, ctx, orderId: id.value };
}

export async function saveCounts(
  ctx: AuthContext | null,
  orderId: string,
  body: unknown,
): Promise<Response> {
  const g = guard(ctx, orderId);
  if (!g.ok) return g.response;

  const counts = validateCounts(asBody(body).counts, { allowClear: true });
  if (!counts.ok) return errorResponse(422, counts.error);

  const { data, error } = await g.ctx.rpc("save_verification_counts", {
    p_order_id: g.orderId,
    p_counts: counts.value,
  });
  if (error) return rpcErrorResponse(error);
  return json({ items: data });
}

/** POST /api/orders/:id/approve — the hard-stop gate. */
export async function approveOrder(
  ctx: AuthContext | null,
  orderId: string,
  body: unknown,
): Promise<Response> {
  const g = guard(ctx, orderId);
  if (!g.ok) return g.response;

  const counts = validateCounts(asBody(body).counts, { allowClear: false });
  if (!counts.ok) return errorResponse(422, counts.error);

  const { data, error } = await g.ctx.rpc("approve_cutting_order", {
    p_order_id: g.orderId,
    p_counts: counts.value.length > 0 ? counts.value : null,
  });
  if (error) return rpcErrorResponse(error);
  return json({ order: data });
}

/** POST /api/orders/:id/reject — requires a reason note. */
export async function rejectOrder(
  ctx: AuthContext | null,
  orderId: string,
  body: unknown,
): Promise<Response> {
  const g = guard(ctx, orderId);
  if (!g.ok) return g.response;

  const input = asBody(body);
  const note = parseRejectionNote(input.note);
  if (!note.ok) {
    return errorResponse(422, note.error, { fieldErrors: { note: note.error } });
  }
  const counts = validateCounts(input.counts, { allowClear: false });
  if (!counts.ok) return errorResponse(422, counts.error);

  const { data, error } = await g.ctx.rpc("reject_cutting_order", {
    p_order_id: g.orderId,
    p_note: note.value,
    p_counts: counts.value.length > 0 ? counts.value : null,
  });
  if (error) return rpcErrorResponse(error);
  return json({ order: data });
}
