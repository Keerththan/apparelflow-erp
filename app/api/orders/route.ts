import { getAuthContext } from "@/lib/server/auth";
import { createOrder } from "@/lib/server/handlers/orders";
import { readJson } from "@/lib/server/http";

export async function POST(request: Request) {
  return createOrder(await getAuthContext(request), await readJson(request));
}
