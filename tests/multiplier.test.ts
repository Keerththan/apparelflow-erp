import { describe, expect, it } from "vitest";
import {
  expectedComponentCounts,
  expectedFabricYards,
  fabricWastagePct,
} from "@/lib/domain/multiplier";

const casualBlouse = [
  { id: "1", component_name: "Front Body Panel", pieces_per_garment: 1 },
  { id: "2", component_name: "Back Body Panel", pieces_per_garment: 1 },
  { id: "3", component_name: "Sleeves (Left & Right)", pieces_per_garment: 2 },
  { id: "4", component_name: "Collar & Stand", pieces_per_garment: 1 },
  { id: "5", component_name: "Sleeve Cuffs", pieces_per_garment: 2 },
];

describe("expectedComponentCounts", () => {
  it("multiplies target quantity by pieces per garment", () => {
    const result = expectedComponentCounts(casualBlouse, 50);
    expect(result.map((c) => c.expected_qty)).toEqual([50, 50, 100, 50, 100]);
  });

  it("keeps component identity for each line", () => {
    const [cuffs] = expectedComponentCounts([casualBlouse[4]], 50);
    expect(cuffs).toMatchObject({ id: "5", component_name: "Sleeve Cuffs" });
  });
});

describe("expectedFabricYards", () => {
  it("is target qty x standard yards per garment", () => {
    expect(expectedFabricYards(50, 1.8)).toBe(90);
    expect(expectedFabricYards(3, 1.1)).toBe(3.3); // not 3.3000000000000003
  });
});

describe("fabricWastagePct", () => {
  it("applies (actual - expected) / expected x 100", () => {
    expect(fabricWastagePct(93, 90)).toBe(3.33);
    expect(fabricWastagePct(90, 90)).toBe(0);
  });

  it("is negative when less fabric than standard was used", () => {
    expect(fabricWastagePct(85.5, 90)).toBe(-5);
  });

  it("rejects a zero expected baseline", () => {
    expect(() => fabricWastagePct(10, 0)).toThrow(RangeError);
  });
});
