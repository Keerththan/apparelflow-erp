import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrder, submitOrder } from "@/lib/server/handlers/orders";
import { contextFor, createTestDb, pgRpc, recipeId, USERS } from "./helpers/db";

let db: PGlite;
let blouseId: string;

beforeEach(async () => {
  db = await createTestDb();
  blouseId = await recipeId(db, "REC-BL01");
});

const validBody = () => ({
  recipeId: blouseId,
  targetQty: 50,
  fabricRollId: "FAB-ROLL-882",
  actualFabricYds: 93.5,
});

describe("POST /api/orders", () => {
  it("lets a cutting supervisor create an order with derived component counts", async () => {
    const res = await createOrder(contextFor(db, "cutting_supervisor"), validBody());
    expect(res.status).toBe(201);
    const { order } = await res.json();
    expect(order).toMatchObject({
      status: "CUTTING_IN_PROGRESS",
      target_qty: 50,
      fabric_roll_id: "FAB-ROLL-882",
      expected_fabric_yds: 90,
      created_by: USERS.cutting_supervisor,
    });

    const { rows } = await db.query<{ expected_qty: number }>(
      `select i.expected_qty
         from public.verification_items i
         join public.recipe_components c on c.id = i.component_id
        where i.order_id = $1 order by c.sort_order`,
      [order.id],
    );
    expect(rows.map((r) => r.expected_qty)).toEqual([50, 50, 100, 50, 100]);
  });

  it("returns 401 without an authenticated user", async () => {
    expect((await createOrder(null, validBody())).status).toBe(401);
  });

  it.each(["cutting_verifier", "sewing_supervisor"] as const)(
    "returns 403 for %s",
    async (role) => {
      const res = await createOrder(contextFor(db, role), validBody());
      expect(res.status).toBe(403);
    },
  );

  it("returns 422 with field errors for invalid input", async () => {
    const res = await createOrder(contextFor(db, "cutting_supervisor"), {
      recipeId: blouseId,
      targetQty: "-5",
      fabricRollId: "",
      actualFabricYds: "abc",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Object.keys(body.fieldErrors).sort()).toEqual([
      "actualFabricYds",
      "fabricRollId",
      "targetQty",
    ]);
  });

  it("returns 422 for an empty payload", async () => {
    const res = await createOrder(contextFor(db, "cutting_supervisor"), undefined);
    expect(res.status).toBe(422);
  });

  it("returns 404 for an unknown recipe", async () => {
    const res = await createOrder(contextFor(db, "cutting_supervisor"), {
      ...validBody(),
      recipeId: "00000000-0000-4000-8000-0000000000ff",
    });
    expect(res.status).toBe(404);
  });

  it("is still rejected by the database if the API role check were bypassed", async () => {
    // A context that *claims* supervisor but whose session is the verifier:
    // the database resolves the role from auth.uid() and refuses.
    const forged = {
      ...contextFor(db, "cutting_supervisor"),
      rpc: pgRpc(db, USERS.cutting_verifier),
    };
    const res = await createOrder(forged, validBody());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/orders/:id/submit", () => {
  async function createdOrderId() {
    const res = await createOrder(contextFor(db, "cutting_supervisor"), validBody());
    return (await res.json()).order.id as string;
  }

  it("moves the order to PENDING_VERIFICATION", async () => {
    const id = await createdOrderId();
    const res = await submitOrder(contextFor(db, "cutting_supervisor"), id);
    expect(res.status).toBe(200);
    expect((await res.json()).order.status).toBe("PENDING_VERIFICATION");
  });

  it("returns 409 when the order was already submitted", async () => {
    const id = await createdOrderId();
    await submitOrder(contextFor(db, "cutting_supervisor"), id);
    const res = await submitOrder(contextFor(db, "cutting_supervisor"), id);
    expect(res.status).toBe(409);
  });

  it("returns 403 for the verifier", async () => {
    const id = await createdOrderId();
    const res = await submitOrder(contextFor(db, "cutting_verifier"), id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a malformed or unknown id", async () => {
    const ctx = contextFor(db, "cutting_supervisor");
    expect((await submitOrder(ctx, "not-a-uuid")).status).toBe(404);
    expect(
      (await submitOrder(ctx, "00000000-0000-4000-8000-0000000000ff")).status,
    ).toBe(404);
  });
});
