// Strict parsers for user input. They accept either a JSON number or a
// plain digit string (form fields), and reject everything else:
// negatives, decimals where not allowed, exponents, whitespace-only,
// booleans, null, arrays, NaN/Infinity.

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const WHOLE_NUMBER = /^\d+$/;
const YARDS = /^\d+(\.\d{1,2})?$/;
const FABRIC_ROLL_ID = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asTrimmedString(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

export function parseWholeNumber(
  raw: unknown,
  { label, min, max }: { label: string; min: number; max: number },
): ParseResult<number> {
  const text = asTrimmedString(raw);
  if (text === null || text === "") {
    return { ok: false, error: `${label} is required` };
  }
  if (text.startsWith("-")) {
    return { ok: false, error: `${label} cannot be negative` };
  }
  if (!WHOLE_NUMBER.test(text)) {
    return { ok: false, error: `${label} must be a whole number` };
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max}` };
  }
  return { ok: true, value };
}

export function parseFabricYards(raw: unknown): ParseResult<number> {
  const label = "Actual fabric used";
  const text = asTrimmedString(raw);
  if (text === null || text === "") {
    return { ok: false, error: `${label} is required` };
  }
  if (text.startsWith("-")) {
    return { ok: false, error: `${label} cannot be negative` };
  }
  if (!YARDS.test(text)) {
    return {
      ok: false,
      error: `${label} must be a number with at most 2 decimals`,
    };
  }
  const value = Number(text);
  if (value <= 0 || value > 1_000_000) {
    return { ok: false, error: `${label} must be greater than 0` };
  }
  return { ok: true, value };
}

export function parseFabricRollId(raw: unknown): ParseResult<string> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Fabric roll ID is required" };
  }
  const value = raw.trim().toUpperCase();
  if (!FABRIC_ROLL_ID.test(value)) {
    return {
      ok: false,
      error: "Fabric roll ID must be 2-40 letters, digits or dashes",
    };
  }
  return { ok: true, value };
}

export function parseUuid(raw: unknown, label: string): ParseResult<string> {
  if (typeof raw !== "string" || !UUID.test(raw.trim())) {
    return { ok: false, error: `${label} is required` };
  }
  return { ok: true, value: raw.trim().toLowerCase() };
}

export type CreateOrderInput = {
  recipeId: string;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
};

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Validates a create-order payload; returns per-field errors for the form. */
export function validateCreateOrderInput(
  body: unknown,
):
  | { ok: true; value: CreateOrderInput }
  | { ok: false; errors: FieldErrors<keyof CreateOrderInput> } {
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const recipeId = parseUuid(input.recipeId, "Recipe");
  const targetQty = parseWholeNumber(input.targetQty, {
    label: "Target batch quantity",
    min: 1,
    max: 100_000,
  });
  const fabricRollId = parseFabricRollId(input.fabricRollId);
  const actualFabricYds = parseFabricYards(input.actualFabricYds);

  if (recipeId.ok && targetQty.ok && fabricRollId.ok && actualFabricYds.ok) {
    return {
      ok: true,
      value: {
        recipeId: recipeId.value,
        targetQty: targetQty.value,
        fabricRollId: fabricRollId.value,
        actualFabricYds: actualFabricYds.value,
      },
    };
  }

  const errors: FieldErrors<keyof CreateOrderInput> = {};
  if (!recipeId.ok) errors.recipeId = recipeId.error;
  if (!targetQty.ok) errors.targetQty = targetQty.error;
  if (!fabricRollId.ok) errors.fabricRollId = fabricRollId.error;
  if (!actualFabricYds.ok) errors.actualFabricYds = actualFabricYds.error;
  return { ok: false, errors };
}
