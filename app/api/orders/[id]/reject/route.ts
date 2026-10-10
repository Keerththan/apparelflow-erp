import { getAuthContext } from "@/lib/server/auth";
import { rejectOrder } from "@/lib/server/handlers/verification";
import { readJson } from "@/lib/server/http";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/orders/[id]/reject">,
) {
  const { id } = await ctx.params;
  return rejectOrder(await getAuthContext(request), id, await readJson(request));
}
