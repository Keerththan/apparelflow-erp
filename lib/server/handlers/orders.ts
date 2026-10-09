import { parseUuid, validateCreateOrderInput } from "@/lib/domain/validation";
import type { AuthContext } from "@/lib/server/auth";
import {
  errorResponse,
  forbidden,
  json,
  rpcErrorResponse,
  unauthorized,
} from "@/lib/server/http";

// Role checks here give fast, explicit 403s; the database functions repeat
// every check, so a bug in this layer still cannot let a write through.

export async function createOrder(
  ctx: AuthContext | null,
  body: unknown,
): Promise<Response> {
  if (!ctx) return unauthorized();
  if (ctx.user.role !== "cutting_supervisor") {
    return forbidden("Only a cutting supervisor can create cutting orders");
  }

  const parsed = validateCreateOrderInput(body);
  if (!parsed.ok) {
    return errorResponse(422, "Invalid cutting order", {
      fieldErrors: parsed.errors,
    });
  }

  const { recipeId, targetQty, fabricRollId, actualFabricYds } = parsed.value;
  const { data, error } = await ctx.rpc("create_cutting_order", {
    p_recipe_id: recipeId,
    p_target_qty: targetQty,
    p_fabric_roll_id: fabricRollId,
    p_actual_fabric_yds: actualFabricYds,
  });
  if (error) return rpcErrorResponse(error);

  return json({ order: data }, 201);
}

export async function submitOrder(
  ctx: AuthContext | null,
  orderId: string,
): Promise<Response> {
  if (!ctx) return unauthorized();
  if (ctx.user.role !== "cutting_supervisor") {
    return forbidden("Only a cutting supervisor can submit cutting orders");
  }

  const id = parseUuid(orderId, "Order ID");
  if (!id.ok) return errorResponse(404, "Cutting order not found");

  const { data, error } = await ctx.rpc("submit_cutting_order", {
    p_order_id: id.value,
  });
  if (error) return rpcErrorResponse(error);

  return json({ order: data });
}
