import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrder, submitOrder } from "@/lib/server/handlers/orders";
import { sewingQueue, startSewing } from "@/lib/server/handlers/sewing";
import { approveOrder, rejectOrder } from "@/lib/server/handlers/verification";
import { asUser, contextFor, createTestDb, recipeId, USERS } from "./helpers/db";

let db: PGlite;
let orders: Record<
  "inProgress" | "pending" | "rejected" | "verified" | "sewing",
  string
>;

async function newOrder(): Promise<string> {
  const res = await createOrder(contextFor(db, "cutting_supervisor"), {
    recipeId: await recipeId(db, "REC-CT02"),
    targetQty: 20,
    fabricRollId: "FAB-ROLL-100",
    actualFabricYds: 23,
  });
  return (await res.json()).order.id;
}

async function exactCounts(orderId: string) {
  const { rows } = await db.query<{ id: string; expected_qty: number }>(
    "select id, expected_qty from public.verification_items where order_id = $1",
    [orderId],
  );
  return rows.map((r) => ({ itemId: r.id, actualQty: r.expected_qty }));
}

/** One order in every lifecycle state. */
beforeEach(async () => {
  db = await createTestDb();
  const supervisor = contextFor(db, "cutting_supervisor");
  const verifier = contextFor(db, "cutting_verifier");

  const inProgress = await newOrder();

  const pending = await newOrder();
  await submitOrder(supervisor, pending);

  const rejected = await newOrder();
  await submitOrder(supervisor, rejected);
  await rejectOrder(verifier, rejected, { note: "Neck binding strips frayed" });

  const verified = await newOrder();
  await submitOrder(supervisor, verified);
  await approveOrder(verifier, verified, { counts: await exactCounts(verified) });

  const sewing = await newOrder();
  await submitOrder(supervisor, sewing);
  await approveOrder(verifier, sewing, { counts: await exactCounts(sewing) });
  await startSewing(contextFor(db, "sewing_supervisor"), sewing);

  orders = { inProgress, pending, rejected, verified, sewing };
});

describe("Spec section 10 — Test 5", () => {
  it("Test 5: unapproved orders never appear in the Sewing Queue database query", async () => {
    const res = await sewingQueue(contextFor(db, "sewing_supervisor"));
    expect(res.status).toBe(200);
    const { orders: queue } = await res.json();

    expect(queue.map((o: { id: string }) => o.id)).toEqual([orders.verified]);
    for (const hidden of [orders.inProgress, orders.pending, orders.rejected]) {
      expect(queue.some((o: { id: string }) => o.id === hidden)).toBe(false);
    }
  });

  it("Test 5b: the sewing role cannot read unverified orders even with a direct table query", async () => {
    // Simulates a hand-written PostgREST call such as
    // GET /rest/v1/cutting_orders?status=eq.PENDING_VERIFICATION
    const rows = await asUser(db, USERS.sewing_supervisor, async () => {
      const result = await db.query<{ id: string; status: string }>(
        `select id, status from public.cutting_orders
          where status in ('CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION', 'REJECTED')`,
      );
      return result.rows;
    });
    expect(rows).toEqual([]);

    const visible = await asUser(db, USERS.sewing_supervisor, async () => {
      const result = await db.query<{ status: string }>(
        "select status from public.cutting_orders",
      );
      return result.rows.map((r) => r.status).sort();
    });
    expect(visible).toEqual(["SEWING_IN_PROGRESS", "VERIFIED"]);
  });
});

describe("GET /api/sewing/queue", () => {
  it("includes piece counts, verifier attribution and audit notes", async () => {
    const res = await sewingQueue(contextFor(db, "sewing_supervisor"));
    const [order] = (await res.json()).orders;
    expect(order).toMatchObject({
      status: "VERIFIED",
      verified_by: { id: USERS.cutting_verifier },
      recipe: { recipe_code: "REC-CT02" },
    });
    expect(order.wastage_pct).toBeCloseTo(4.55); // (23 - 22) / 22 * 100
    expect(order.components).toHaveLength(5);
    expect(order.audit_notes[0]).toMatchObject({ decision: "APPROVED" });
  });

  it.each(["cutting_supervisor", "cutting_verifier"] as const)(
    "returns 403 for %s",
    async (role) => {
      expect((await sewingQueue(contextFor(db, role))).status).toBe(403);
    },
  );

  it("returns 401 without a session", async () => {
    expect((await sewingQueue(null)).status).toBe(401);
  });
});

describe("POST /api/orders/:id/start-sewing", () => {
  it("starts assembly for a verified batch and removes it from the queue", async () => {
    const sewing = contextFor(db, "sewing_supervisor");
    const res = await startSewing(sewing, orders.verified);
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({
      status: "SEWING_IN_PROGRESS",
      sewing_started_by: USERS.sewing_supervisor,
    });

    const queue = await (await sewingQueue(sewing)).json();
    expect(queue.orders).toEqual([]);
  });

  it("returns 404 for unverified orders without revealing them", async () => {
    const sewing = contextFor(db, "sewing_supervisor");
    for (const id of [orders.inProgress, orders.pending, orders.rejected]) {
      expect((await startSewing(sewing, id)).status).toBe(404);
    }
  });

  it("returns 409 when assembly already started", async () => {
    const res = await startSewing(contextFor(db, "sewing_supervisor"), orders.sewing);
    expect(res.status).toBe(409);
  });

  it("returns 403 for cutting roles", async () => {
    for (const role of ["cutting_supervisor", "cutting_verifier"] as const) {
      expect((await startSewing(contextFor(db, role), orders.verified)).status).toBe(403);
    }
  });
});
