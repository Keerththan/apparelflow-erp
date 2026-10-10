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

export type VerificationItemRow = {
  id: string;
  expected_qty: number;
  actual_qty: number | null;
  status: "GREEN" | "YELLOW" | "RED" | null;
  component: { component_name: string; pieces_per_garment: number; sort_order: number };
};

export type OrderDetail = Omit<OrderSummary, "logs"> & {
  items: VerificationItemRow[];
  verifier: { full_name: string } | null;
  logs: (OrderSummary["logs"][number] & {
    wastage_pct: number | null;
    variances: {
      component_name: string;
      expected_qty: number;
      actual_qty: number | null;
      variance: number | null;
      status: "GREEN" | "YELLOW" | "RED" | null;
    }[];
  })[];
};

/** One order with its component counts; null when missing or hidden by RLS. */
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await (await db())
    .from("cutting_orders")
    .select(
      `id, order_no, status, target_qty, fabric_roll_id, actual_fabric_yds,
       expected_fabric_yds, wastage_pct, created_at, submitted_at, verified_at,
       recipe:recipes(recipe_code, name, wastage_cap),
       creator:profiles!cutting_orders_created_by_fkey(full_name),
       verifier:profiles!cutting_orders_verified_by_fkey(full_name),
       items:verification_items(id, expected_qty, actual_qty, status,
         component:recipe_components(component_name, pieces_per_garment, sort_order)),
       logs:verification_logs(decision, rejection_note, wastage_pct, variances,
         created_at, verifier:profiles(full_name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load order: ${error.message}`);
  if (!data) return null;
  const order = data as unknown as OrderDetail;
  return {
    ...order,
    items: [...order.items].sort(
      (a, b) => a.component.sort_order - b.component.sort_order,
    ),
    logs: [...order.logs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export type SewingQueueOrder = {
  id: string;
  order_no: string;
  status: "VERIFIED";
  target_qty: number;
  fabric_roll_id: string;
  actual_fabric_yds: number;
  expected_fabric_yds: number;
  wastage_pct: number;
  verified_at: string;
  verified_by: { id: string; full_name: string };
  recipe: { recipe_code: string; name: string; category: string; wastage_cap: number };
  components: {
    component_name: string;
    expected_qty: number;
    actual_qty: number;
    variance: number;
    status: "GREEN" | "YELLOW";
  }[];
  audit_notes: {
    decision: "APPROVED" | "REJECTED";
    rejection_note: string | null;
    wastage_pct: number | null;
    created_at: string;
    verifier: string;
  }[];
};

/** Same database function as GET /api/sewing/queue (VERIFIED only). */
export async function getSewingQueue(): Promise<SewingQueueOrder[]> {
  const { data, error } = await (await db()).rpc("get_sewing_queue");
  if (error) throw new Error(`Failed to load sewing queue: ${error.message}`);
  return data as SewingQueueOrder[];
}

export type AssemblyOrder = {
  id: string;
  order_no: string;
  target_qty: number;
  sewing_started_at: string;
  recipe: { recipe_code: string; name: string };
  starter: { full_name: string } | null;
};

export async function listSewingInProgress(): Promise<AssemblyOrder[]> {
  const { data, error } = await (await db())
    .from("cutting_orders")
    .select(
      `id, order_no, target_qty, sewing_started_at,
       recipe:recipes(recipe_code, name),
       starter:profiles!cutting_orders_sewing_started_by_fkey(full_name)`,
    )
    .eq("status", "SEWING_IN_PROGRESS")
    .order("sewing_started_at", { ascending: false });
  if (error) throw new Error(`Failed to load assembly line: ${error.message}`);
  return data as unknown as AssemblyOrder[];
}
