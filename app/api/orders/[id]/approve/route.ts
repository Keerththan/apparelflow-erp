import { getAuthContext } from "@/lib/server/auth";
import { approveOrder } from "@/lib/server/handlers/verification";
import { readJson } from "@/lib/server/http";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/orders/[id]/approve">,
) {
  const { id } = await ctx.params;
  return approveOrder(await getAuthContext(request), id, await readJson(request));
}
