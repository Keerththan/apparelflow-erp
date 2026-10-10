// Traffic-light rules (spec 7.3). The database derives the stored status
// with the same rules (generated column) — this mirror drives the live UI.

export type ComponentStatus = "GREEN" | "YELLOW" | "RED";

export const STATUS_META: Record<
  ComponentStatus,
  { label: string; description: string }
> = {
  GREEN: { label: "MATCH", description: "Exact component match" },
  YELLOW: { label: "EXCESS", description: "Surplus pieces — batch may proceed" },
  RED: { label: "SHORTAGE", description: "Garment assembly incomplete — approval blocked" },
};

export function componentStatus(
  expectedQty: number,
  actualQty: number | null,
): ComponentStatus | null {
  if (actualQty === null) return null;
  if (actualQty === expectedQty) return "GREEN";
  return actualQty > expectedQty ? "YELLOW" : "RED";
}

export type VerificationSummary = Record<ComponentStatus, number> & {
  uncounted: number;
  /** True only when every component is counted and none is short. */
  canApprove: boolean;
};

export function verificationSummary(
  items: { expected_qty: number; actual_qty: number | null }[],
): VerificationSummary {
  const summary = { GREEN: 0, YELLOW: 0, RED: 0, uncounted: 0 };
  for (const item of items) {
    const status = componentStatus(item.expected_qty, item.actual_qty);
    if (status) summary[status] += 1;
    else summary.uncounted += 1;
  }
  return {
    ...summary,
    canApprove: items.length > 0 && summary.RED === 0 && summary.uncounted === 0,
  };
}
