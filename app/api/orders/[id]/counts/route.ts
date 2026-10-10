import { getAuthContext } from "@/lib/server/auth";
import { saveCounts } from "@/lib/server/handlers/verification";
import { readJson } from "@/lib/server/http";

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/orders/[id]/counts">,
) {
  const { id } = await ctx.params;
  return saveCounts(await getAuthContext(request), id, await readJson(request));
}
