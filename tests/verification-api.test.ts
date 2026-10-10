import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrder, recutOrder, submitOrder } from "@/lib/server/handlers/orders";
import {
  approveOrder,
  rejectOrder,
  saveCounts,
} from "@/lib/server/handlers/verification";
import { contextFor, createTestDb, recipeId, USERS } from "./helpers/db";

let db: PGlite;

type Item = { id: string; expected_qty: number };

/** Creates a REC-BL01 order for 50 garments and submits it to QC. */
async function pendingOrder(): Promise<{ id: string; items: Item[] }> {
  const supervisor = contextFor(db, "cutting_supervisor");
  const res = await createOrder(supervisor, {
    recipeId: await recipeId(db, "REC-BL01"),
    targetQty: 50,
    fabricRollId: "FAB-ROLL-882",
    actualFabricYds: 93,
  });
  const { order } = await res.json();
  await submitOrder(supervisor, order.id);
  const { rows } = await db.query<Item>(
    `select i.id, i.expected_qty
       from public.verification_items i
       join public.recipe_components c on c.id = i.component_id
      where i.order_id = $1 order by c.sort_order`,
    [order.id],
  );
  return { id: order.id, items: rows };
}

const exactCounts = (items: Item[]) =>
  items.map((i) => ({ itemId: i.id, actualQty: i.expected_qty }));

const withShortage = (items: Item[]) =>
  items.map((i, n) => ({
    itemId: i.id,
    actualQty: n === items.length - 1 ? i.expected_qty - 1 : i.expected_qty,
  }));

async function orderRow(id: string) {
  const { rows } = await db.query<{
    status: string;
    verified_by: string | null;
    verified_at: string | null;
    wastage_pct: string | null;
  }>("select status, verified_by, verified_at, wastage_pct from public.cutting_orders where id = $1", [id]);
  return rows[0];
}

beforeEach(async () => {
  db = await createTestDb();
});

describe("Spec section 10 — required domain tests", () => {
  it("Test 1: an order with all GREEN components can be approved by an authenticated Verifier", async () => {
    const { id, items } = await pendingOrder();
    const res = await approveOrder(contextFor(db, "cutting_verifier"), id, {
      counts: exactCounts(items),
    });

    expect(res.status).toBe(200);
    const { order } = await res.json();
    expect(order.status).toBe("VERIFIED");
    expect(order.verified_by).toBe(USERS.cutting_verifier);
    expect(order.verified_at).toBeTruthy();
    // (93 - 90) / 90 * 100
    expect(order.wastage_pct).toBe(3.33);
  });

  it("Test 2: an order containing at least one RED (shortage) component blocks approval and returns an error", async () => {
    const { id, items } = await pendingOrder();
    const res = await approveOrder(contextFor(db, "cutting_verifier"), id, {
      counts: withShortage(items),
    });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/short \(RED\)/);
    expect((await orderRow(id)).status).toBe("PENDING_VERIFICATION");
  });

  it("Test 3: rejecting an order without a reason note is rejected by backend validation", async () => {
    const { id } = await pendingOrder();
    const verifier = contextFor(db, "cutting_verifier");

    for (const body of [{}, { note: "" }, { note: "    " }, { note: null }]) {
      const res = await rejectOrder(verifier, id, body);
      expect(res.status).toBe(422);
      expect((await res.json()).fieldErrors.note).toBeTruthy();
    }
    expect((await orderRow(id)).status).toBe("PENDING_VERIFICATION");
  });

  it.each(["cutting_supervisor", "sewing_supervisor"] as const)(
    "Test 4: non-verifier role %s receives 403 Forbidden when attempting verification approval",
    async (role) => {
      const { id, items } = await pendingOrder();
      const res = await approveOrder(contextFor(db, role), id, {
        counts: exactCounts(items),
      });

      expect(res.status).toBe(403);
      expect((await orderRow(id)).status).toBe("PENDING_VERIFICATION");
    },
  );
});

describe("Verification gatekeeper edge cases", () => {
  it("returns 401 for an unauthenticated approval", async () => {
    const { id } = await pendingOrder();
    expect((await approveOrder(null, id, {})).status).toBe(401);
  });

  it("returns 422 when components are uncounted", async () => {
    const { id, items } = await pendingOrder();
    const res = await approveOrder(contextFor(db, "cutting_verifier"), id, {
      counts: exactCounts(items).slice(0, 2),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/not counted/);
  });

  it("approves YELLOW (excess) components", async () => {
    const { id, items } = await pendingOrder();
    const counts = exactCounts(items);
    counts[0].actualQty += 5;
    const res = await approveOrder(contextFor(db, "cutting_verifier"), id, { counts });
    expect(res.status).toBe(200);
  });

  it("ignores a forged verifier id and timestamp in the request body", async () => {
    const { id, items } = await pendingOrder();
    const res = await approveOrder(contextFor(db, "cutting_verifier"), id, {
      counts: exactCounts(items),
      verifierId: USERS.cutting_supervisor,
      verified_by: USERS.cutting_supervisor,
      verifiedAt: "2000-01-01T00:00:00Z",
    });
    const { order } = await res.json();
    expect(order.verified_by).toBe(USERS.cutting_verifier);
    expect(order.verified_at.startsWith("2000")).toBe(false);
  });

  it("rejects invalid counts with 422", async () => {
    const { id, items } = await pendingOrder();
    const verifier = contextFor(db, "cutting_verifier");
    for (const actualQty of [-1, 2.5, "abc", ""]) {
      const res = await approveOrder(verifier, id, {
        counts: [{ itemId: items[0].id, actualQty }],
      });
      expect(res.status).toBe(422);
    }
  });

  it("returns 409 when approving an order that is not pending", async () => {
    const { id, items } = await pendingOrder();
    const verifier = contextFor(db, "cutting_verifier");
    await approveOrder(verifier, id, { counts: exactCounts(items) });
    const res = await approveOrder(verifier, id, { counts: exactCounts(items) });
    expect(res.status).toBe(409);
  });

  it("writes an immutable audit log with per-component variances", async () => {
    const { id, items } = await pendingOrder();
    await approveOrder(contextFor(db, "cutting_verifier"), id, {
      counts: exactCounts(items),
    });

    const { rows } = await db.query<{
      decision: string;
      verifier_id: string;
      wastage_pct: string;
      variances: { status: string; variance: number }[];
    }>("select decision, verifier_id, wastage_pct, variances from public.verification_logs where order_id = $1", [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      decision: "APPROVED",
      verifier_id: USERS.cutting_verifier,
      wastage_pct: "3.33",
    });
    expect(rows[0].variances.every((v) => v.status === "GREEN" && v.variance === 0)).toBe(true);

    // Even the database owner cannot rewrite the audit trail
    await expect(
      db.query("update public.verification_logs set wastage_pct = 0 where order_id = $1", [id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query("update public.cutting_orders set wastage_pct = 0 where id = $1", [id]),
    ).rejects.toThrow(/immutable/);
  });

  it("persists saved counts so they survive a reload", async () => {
    const { id, items } = await pendingOrder();
    const res = await saveCounts(contextFor(db, "cutting_verifier"), id, {
      counts: [{ itemId: items[0].id, actualQty: 49 }],
    });
    expect(res.status).toBe(200);
    const { rows } = await db.query<{ actual_qty: number; status: string }>(
      "select actual_qty, status from public.verification_items where id = $1",
      [items[0].id],
    );
    expect(rows[0]).toEqual({ actual_qty: 49, status: "RED" });
  });
});

describe("Reject and re-cut flow", () => {
  it("returns a rejected batch to the supervisor for re-cutting", async () => {
    const { id, items } = await pendingOrder();
    const verifier = contextFor(db, "cutting_verifier");
    const supervisor = contextFor(db, "cutting_supervisor");

    const rejected = await rejectOrder(verifier, id, {
      note: "Sleeve cuffs short by 1 piece",
      counts: withShortage(items),
    });
    expect(rejected.status).toBe(200);
    expect((await rejected.json()).order.status).toBe("REJECTED");

    expect((await recutOrder(verifier, id, {})).status).toBe(403);

    const recut = await recutOrder(supervisor, id, { actualFabricYds: "95.5" });
    expect(recut.status).toBe(200);
    const { order } = await recut.json();
    expect(order).toMatchObject({ status: "CUTTING_IN_PROGRESS", actual_fabric_yds: 95.5 });

    const { rows } = await db.query<{ n: number }>(
      "select count(actual_qty)::int as n from public.verification_items where order_id = $1",
      [id],
    );
    expect(rows[0].n).toBe(0);

    // Resubmit and approve on the second attempt
    await submitOrder(supervisor, id);
    const approved = await approveOrder(verifier, id, { counts: exactCounts(items) });
    expect(approved.status).toBe(200);
  });

  it("rejects an invalid re-cut fabric value with 422", async () => {
    const { id } = await pendingOrder();
    await rejectOrder(contextFor(db, "cutting_verifier"), id, { note: "Fabric flaw on roll" });
    const res = await recutOrder(contextFor(db, "cutting_supervisor"), id, {
      actualFabricYds: "-3",
    });
    expect(res.status).toBe(422);
  });
});
