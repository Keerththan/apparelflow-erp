import { getAuthContext } from "@/lib/server/auth";
import { submitOrder } from "@/lib/server/handlers/orders";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/orders/[id]/submit">,
) {
  const { id } = await ctx.params;
  return submitOrder(await getAuthContext(request), id);
}
