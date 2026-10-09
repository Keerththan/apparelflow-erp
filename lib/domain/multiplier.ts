export type RecipeComponent = {
  id: string;
  component_name: string;
  pieces_per_garment: number;
};

export type ExpectedComponent = RecipeComponent & { expected_qty: number };

/**
 * Multiplier engine: expected cut pieces for each recipe component.
 * e.g. 50 garments x 2 cuffs = 100 cuffs expected.
 *
 * The database derives the stored values itself (create_cutting_order);
 * this mirror powers the live preview in the order form.
 */
export function expectedComponentCounts(
  components: RecipeComponent[],
  targetQty: number,
): ExpectedComponent[] {
  return components.map((c) => ({
    ...c,
    expected_qty: targetQty * c.pieces_per_garment,
  }));
}

/** Expected fabric = target garments x standard yards per garment (2 dp). */
export function expectedFabricYards(
  targetQty: number,
  stdFabricYards: number,
): number {
  return roundTo2(targetQty * stdFabricYards);
}

/**
 * Fabric Wastage % = (Actual - Expected) / Expected x 100, rounded to 2 dp.
 * Negative means less fabric was used than the standard allows.
 */
export function fabricWastagePct(
  actualFabricYds: number,
  expectedFabricYds: number,
): number {
  if (!(expectedFabricYds > 0)) {
    throw new RangeError("Expected fabric must be greater than zero");
  }
  return roundTo2(
    ((actualFabricYds - expectedFabricYds) / expectedFabricYds) * 100,
  );
}

function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
