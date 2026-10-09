import { cookies } from "next/headers";
import type { OrderStatus } from "@/lib/order-status";
import { createClient } from "@/utils/supabase/server";

// Read models for Server Components. Every query runs with the signed-in
// user's session, so RLS decides which rows come back.

async function db() {
  return createClient(await cookies());
}

export type RecipeWithComponents = {
  id: string;
  recipe_code: string;
  name: string;
  category: string;
  std_fabric_yards: number;
  wastage_cap: number;
  components: {
    id: string;
    component_name: string;
    pieces_per_garment: number;
    sort_order: number;
  }[];
};

export async function listRecipes(): Promise<RecipeWithComponents[]> {
  const { data, error } = await (await db())
    .from("recipes")
    .select(
      "id, recipe_code, name, category, std_fabric_yards, wastage_cap, components:recipe_components(id, component_name, pieces_per_garment, sort_order)",
    )
    .order("recipe_code");
  if (error) throw new Error(`Failed to load recipes: ${error.message}`);
  return (data as RecipeWithComponents[]).map((r) => ({
    ...r,
    components: [...r.components].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export type OrderSummary = {
  id: string;
  order_no: string;
  status: OrderStatus;
  target_qty: number;
  fabric_roll_id: string;
  actual_fabric_yds: number;
  expected_fabric_yds: number;
  wastage_pct: number | null;
  created_at: string;
  submitted_at: string | null;
  verified_at: string | null;
  recipe: { recipe_code: string; name: string; wastage_cap: number };
  creator: { full_name: string } | null;
  logs: {
    decision: "APPROVED" | "REJECTED";
    rejection_note: string | null;
    created_at: string;
    verifier: { full_name: string } | null;
  }[];
};

export async function listOrders(): Promise<OrderSummary[]> {
  const { data, error } = await (await db())
    .from("cutting_orders")
    .select(
      `id, order_no, status, target_qty, fabric_roll_id, actual_fabric_yds,
       expected_fabric_yds, wastage_pct, created_at, submitted_at, verified_at,
       recipe:recipes(recipe_code, name, wastage_cap),
       creator:profiles!cutting_orders_created_by_fkey(full_name),
       logs:verification_logs(decision, rejection_note, created_at,
         verifier:profiles(full_name))`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return (data as unknown as OrderSummary[]).map((o) => ({
    ...o,
    logs: [...o.logs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}
