import { describe, expect, it } from "vitest";
import { componentStatus, verificationSummary } from "@/lib/domain/traffic-light";
import { parseRejectionNote, validateCounts } from "@/lib/domain/validation";

describe("componentStatus", () => {
  it("is GREEN when actual == expected", () => {
    expect(componentStatus(100, 100)).toBe("GREEN");
  });
  it("is YELLOW when actual > expected", () => {
    expect(componentStatus(100, 101)).toBe("YELLOW");
  });
  it("is RED when actual < expected", () => {
    expect(componentStatus(100, 99)).toBe("RED");
    expect(componentStatus(100, 0)).toBe("RED");
  });
  it("is null when not counted yet", () => {
    expect(componentStatus(100, null)).toBeNull();
  });
});

describe("verificationSummary", () => {
  const item = (expected_qty: number, actual_qty: number | null) => ({
    expected_qty,
    actual_qty,
  });

  it("allows approval when all components are GREEN", () => {
    const s = verificationSummary([item(50, 50), item(100, 100)]);
    expect(s).toMatchObject({ GREEN: 2, RED: 0, uncounted: 0, canApprove: true });
  });

  it("allows approval with YELLOW excess", () => {
    expect(verificationSummary([item(50, 52), item(100, 100)]).canApprove).toBe(true);
  });

  it("blocks approval when any component is RED", () => {
    const s = verificationSummary([item(50, 50), item(100, 99)]);
    expect(s).toMatchObject({ RED: 1, canApprove: false });
  });

  it("blocks approval while any component is uncounted", () => {
    expect(verificationSummary([item(50, 50), item(100, null)]).canApprove).toBe(false);
  });

  it("blocks approval for an order with no components", () => {
    expect(verificationSummary([]).canApprove).toBe(false);
  });
});

describe("validateCounts", () => {
  const id = "0b7f2f8e-3c1a-4d2b-9f43-6a1c2b3d4e5f";

  it("maps to the database shape", () => {
    expect(validateCounts([{ itemId: id, actualQty: "48" }], { allowClear: false })).toEqual({
      ok: true,
      value: [{ item_id: id, actual_qty: 48 }],
    });
  });

  it.each([-1, 2.5, "abc", "", true])("rejects count %j", (actualQty) => {
    expect(validateCounts([{ itemId: id, actualQty }], { allowClear: false }).ok).toBe(false);
  });

  it("only accepts null (clear) when allowed", () => {
    const counts = [{ itemId: id, actualQty: null }];
    expect(validateCounts(counts, { allowClear: true }).ok).toBe(true);
    expect(validateCounts(counts, { allowClear: false }).ok).toBe(false);
  });

  it("rejects non-array payloads and bad item ids", () => {
    expect(validateCounts("x", { allowClear: false }).ok).toBe(false);
    expect(validateCounts([{ itemId: "nope", actualQty: 1 }], { allowClear: false }).ok).toBe(false);
  });
});

describe("parseRejectionNote", () => {
  it.each([undefined, null, "", "   ", "bad", 42])("rejects %j", (raw) => {
    expect(parseRejectionNote(raw).ok).toBe(false);
  });

  it("trims a valid note", () => {
    expect(parseRejectionNote("  Collar short by 2  ")).toEqual({
      ok: true,
      value: "Collar short by 2",
    });
  });
});
