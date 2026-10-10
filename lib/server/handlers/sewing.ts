import { parseUuid } from "@/lib/domain/validation";
import type { AuthContext } from "@/lib/server/auth";
import {
  errorResponse,
  forbidden,
  json,
  rpcErrorResponse,
  unauthorized,
} from "@/lib/server/http";

/**
 * GET /api/sewing/queue. Query-string parameters are deliberately ignored:
 * the VERIFIED filter lives inside get_sewing_queue() in the database.
 */
export async function sewingQueue(ctx: AuthContext | null): Promise<Response> {
  if (!ctx) return unauthorized();
  if (ctx.user.role !== "sewing_supervisor") {
    return forbidden("Only a sewing supervisor can access the sewing queue");
  }
  const { data, error } = await ctx.rpc("get_sewing_queue");
  if (error) return rpcErrorResponse(error);
  return json({ orders: data });
}

/** POST /api/orders/:id/start-sewing */
export async function startSewing(
  ctx: AuthContext | null,
  orderId: string,
): Promise<Response> {
  if (!ctx) return unauthorized();
  if (ctx.user.role !== "sewing_supervisor") {
    return forbidden("Only a sewing supervisor can start sewing assembly");
  }
  const id = parseUuid(orderId, "Order ID");
  if (!id.ok) return errorResponse(404, "Order not found in the sewing queue");

  const { data, error } = await ctx.rpc("start_sewing_assembly", {
    p_order_id: id.value,
  });
  if (error) return rpcErrorResponse(error);
  return json({ order: data });
}
