import { getAuthContext } from "@/lib/server/auth";
import { sewingQueue } from "@/lib/server/handlers/sewing";

export async function GET(request: Request) {
  return sewingQueue(await getAuthContext(request));
}
