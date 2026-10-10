import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Automated contrast audit (spec section 11: zero-tolerance for low-contrast
// inputs). Reads Tailwind v4's real OKLCH palette and checks every
// foreground/background pair the UI uses against WCAG 2.2 AA:
//   text >= 4.5:1, UI component boundaries (input borders) >= 3:1.

const theme = readFileSync(
  join(__dirname, "..", "node_modules", "tailwindcss", "theme.css"),
  "utf8",
);

function oklchToSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  // Clamp to the sRGB gamut, as the browser does when rendering
  return linear.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

function relativeLuminance(token: string): number {
  if (token === "white") return 1;
  const match = theme.match(
    new RegExp(`--color-${token}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`Unknown Tailwind colour: ${token}`);
  const [r, g, b] = oklchToSrgb(Number(match[1]) / 100, Number(match[2]), Number(match[3]));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; // values are already linear-light
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// [foreground, background, where it is used]
const TEXT_PAIRS: [string, string, string][] = [
  ["slate-900", "white", "body text, input text, table cells, dialogs"],
  ["slate-900", "slate-50", "page background, fabric check panel"],
  ["slate-900", "slate-100", "table headers, select options"],
  ["slate-700", "white", "secondary text"],
  ["slate-700", "slate-50", "secondary text on page background"],
  ["slate-700", "blue-50", "demo credential panel text"],
  ["slate-500", "white", "input placeholders"],
  ["slate-700", "slate-100", "disabled inputs"],
  ["slate-700", "slate-300", "disabled primary/success/danger buttons"],
  ["slate-600", "slate-100", "disabled secondary buttons"],
  ["blue-800", "white", "links"],
  ["blue-800", "slate-50", "back links on page background"],
  ["white", "blue-700", "primary buttons"],
  ["white", "blue-800", "primary buttons (hover)"],
  ["white", "green-700", "Approve Batch button"],
  ["white", "red-700", "Reject buttons"],
  ["white", "slate-900", "header"],
  ["slate-300", "slate-900", "header subtitle"],
  ["red-200", "slate-900", "header error text"],
  ["blue-900", "blue-100", "role badge, pending badge"],
  ["slate-900", "slate-200", "cutting-in-progress badge"],
  ["red-900", "red-100", "rejected badge, RED traffic light"],
  ["red-900", "red-50", "rejection panels, RED rows"],
  ["red-800", "white", "inline field errors"],
  ["red-800", "red-50", "field errors inside the reject panel"],
  ["green-900", "green-100", "verified badge, GREEN traffic light"],
  ["green-900", "green-50", "success messages"],
  ["amber-900", "amber-100", "YELLOW traffic light"],
  ["violet-900", "violet-100", "sewing-in-progress badge"],
  ["slate-800", "slate-100", "NOT COUNTED badge"],
];

const BOUNDARY_PAIRS: [string, string, string][] = [
  ["slate-500", "white", "input and select borders"],
  ["red-700", "white", "invalid input border"],
  ["blue-700", "white", "focused input border"],
];

describe("UI colour contrast (WCAG 2.2 AA)", () => {
  it.each(TEXT_PAIRS)("text %s on %s (%s) is at least 4.5:1", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BOUNDARY_PAIRS)("boundary %s on %s (%s) is at least 3:1", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("matches known reference ratios", () => {
    // Sanity check of the colour maths against values from WebAIM's checker
    expect(contrast("slate-900", "white")).toBeCloseTo(17.85, 0);
    expect(contrast("white", "blue-700")).toBeGreaterThan(6);
  });
});
