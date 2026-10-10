import { getAuthContext } from "@/lib/server/auth";
import { startSewing } from "@/lib/server/handlers/sewing";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/orders/[id]/start-sewing">,
) {
  const { id } = await ctx.params;
  return startSewing(await getAuthContext(request), id);
}
