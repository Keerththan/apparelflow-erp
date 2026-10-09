import { describe, expect, it } from "vitest";
import {
  parseFabricRollId,
  parseFabricYards,
  parseWholeNumber,
  validateCreateOrderInput,
} from "@/lib/domain/validation";

const qty = (raw: unknown) =>
  parseWholeNumber(raw, { label: "Qty", min: 1, max: 100_000 });

describe("parseWholeNumber", () => {
  it.each([
    [50, 50],
    ["50", 50],
    [" 7 ", 7],
  ])("accepts %j", (raw, expected) => {
    expect(qty(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["", "required"],
    ["   ", "required"],
    [null, "required"],
    [undefined, "required"],
    [true, "required"],
    [[5], "required"],
    [Number.NaN, "required"],
    [Number.POSITIVE_INFINITY, "required"],
    [-5, "negative"],
    ["-5", "negative"],
    [2.5, "whole number"],
    ["2.5", "whole number"],
    ["1e3", "whole number"],
    ["0x10", "whole number"],
    ["abc", "whole number"],
    [0, "between"],
    [100_001, "between"],
  ])("rejects %j", (raw, message) => {
    const result = qty(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});

describe("parseFabricYards", () => {
  it.each([
    [93, 93],
    ["93.5", 93.5],
    [93.25, 93.25],
  ])("accepts %j", (raw, expected) => {
    expect(parseFabricYards(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([[""], [0], ["0"], [-1], ["-1"], ["93.125"], ["abc"], [null], [0.1 + 0.2]])(
    "rejects %j",
    (raw) => {
      expect(parseFabricYards(raw).ok).toBe(false);
    },
  );
});

describe("parseFabricRollId", () => {
  it("normalises to upper case", () => {
    expect(parseFabricRollId(" fab-roll-882 ")).toEqual({
      ok: true,
      value: "FAB-ROLL-882",
    });
  });

  it.each(["", "  ", "A", "FAB ROLL", "x'; drop table--", 882])(
    "rejects %j",
    (raw) => {
      expect(parseFabricRollId(raw).ok).toBe(false);
    },
  );
});

describe("validateCreateOrderInput", () => {
  const valid = {
    recipeId: "0b7f2f8e-3c1a-4d2b-9f43-6a1c2b3d4e5f",
    targetQty: "50",
    fabricRollId: "FAB-ROLL-882",
    actualFabricYds: "93.5",
  };

  it("returns typed values for a valid payload", () => {
    expect(validateCreateOrderInput(valid)).toEqual({
      ok: true,
      value: {
        recipeId: valid.recipeId,
        targetQty: 50,
        fabricRollId: "FAB-ROLL-882",
        actualFabricYds: 93.5,
      },
    });
  });

  it("returns an error for every invalid field", () => {
    const result = validateCreateOrderInput({
      recipeId: "nope",
      targetQty: "-1",
      fabricRollId: "",
      actualFabricYds: "1.234",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "actualFabricYds",
        "fabricRollId",
        "recipeId",
        "targetQty",
      ]);
    }
  });

  it.each([null, undefined, "string", [], 42])(
    "rejects a non-object payload %j",
    (body) => {
      expect(validateCreateOrderInput(body).ok).toBe(false);
    },
  );
});
