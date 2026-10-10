import { getAuthContext } from "@/lib/server/auth";
import { recutOrder } from "@/lib/server/handlers/orders";
import { readJson } from "@/lib/server/http";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/orders/[id]/recut">,
) {
  const { id } = await ctx.params;
  return recutOrder(await getAuthContext(request), id, await readJson(request));
}
