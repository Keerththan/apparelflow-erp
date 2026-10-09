"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  buttonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
  optionClass,
} from "@/components/ui";
import { formatPct, formatYards } from "@/lib/format";
import {
  expectedComponentCounts,
  expectedFabricYards,
  fabricWastagePct,
} from "@/lib/domain/multiplier";
import {
  validateCreateOrderInput,
  type CreateOrderInput,
  type FieldErrors,
} from "@/lib/domain/validation";
import type { RecipeWithComponents } from "@/lib/server/queries";

type Field = keyof CreateOrderInput;
type FormValues = Record<Field, string>;

const EMPTY: FormValues = {
  recipeId: "",
  targetQty: "",
  fabricRollId: "",
  actualFabricYds: "",
};

export function CreateOrderDialog({
  recipes,
}: {
  recipes: RecipeWithComponents[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Derived on every render — no effects, so no sync loops.
  const validation = validateCreateOrderInput(values);
  const clientErrors: FieldErrors<Field> = validation.ok ? {} : validation.errors;
  const errorFor = (field: Field) =>
    serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);

  const recipe = recipes.find((r) => r.id === values.recipeId);
  const qty = validation.ok
    ? validation.value.targetQty
    : clientErrors.targetQty
      ? null
      : Number(values.targetQty);
  const fabric = clientErrors.actualFabricYds ? null : Number(values.actualFabricYds);
  const expectedFabric =
    recipe && qty ? expectedFabricYards(qty, Number(recipe.std_fabric_yards)) : null;
  const wastage =
    expectedFabric && fabric ? fabricWastagePct(fabric, expectedFabric) : null;

  function update(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
  }

  function open() {
    setValues(EMPTY);
    setTouched({});
    setServerErrors({});
    setFormError(null);
    dialogRef.current?.showModal();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ recipeId: true, targetQty: true, fabricRollId: true, actualFabricYds: true });
    if (!validation.ok) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.value),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.fieldErrors) setServerErrors(body.fieldErrors);
        setFormError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setFormError("Network error — the order was not created");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldProps = (field: Field) => ({
    id: field,
    name: field,
    value: values[field],
    "aria-invalid": errorFor(field) ? true : undefined,
    "aria-describedby": errorFor(field) ? `${field}-error` : undefined,
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
    className: `${inputClass} mt-1`,
  });

  const fieldError = (field: Field) =>
    errorFor(field) ? (
      <p id={`${field}-error`} className={fieldErrorClass}>
        {errorFor(field)}
      </p>
    ) : null;

  return (
    <>
      <button type="button" className={buttonClass.primary} onClick={open}>
        + New cutting order
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="create-order-title"
        className="m-auto w-[min(100%-2rem,48rem)] rounded-lg border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/60"
      >
        <form onSubmit={submit} noValidate className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="create-order-title" className="text-xl font-bold">
              New cutting order
            </h2>
            <button
              type="button"
              className={`${buttonClass.secondary} px-3 py-1`}
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="recipeId" className={labelClass}>
                Production recipe
              </label>
              <select
                {...fieldProps("recipeId")}
                onChange={(e) => update("recipeId", e.target.value)}
              >
                <option value="" className={optionClass}>
                  Select a recipe…
                </option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id} className={optionClass}>
                    {r.recipe_code} — {r.name} ({Number(r.std_fabric_yards)} yds/pc,
                    wastage cap {Number(r.wastage_cap)}%)
                  </option>
                ))}
              </select>
              {fieldError("recipeId")}
            </div>

            <div>
              <label htmlFor="targetQty" className={labelClass}>
                Target batch quantity (garments)
              </label>
              <input
                {...fieldProps("targetQty")}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 50"
                onChange={(e) => update("targetQty", e.target.value)}
              />
              {fieldError("targetQty")}
            </div>

            <div>
              <label htmlFor="fabricRollId" className={labelClass}>
                Fabric roll ID
              </label>
              <input
                {...fieldProps("fabricRollId")}
                type="text"
                autoComplete="off"
                placeholder="e.g. FAB-ROLL-882"
                onChange={(e) => update("fabricRollId", e.target.value)}
              />
              {fieldError("fabricRollId")}
            </div>

            <div>
              <label htmlFor="actualFabricYds" className={labelClass}>
                Actual fabric used (yards)
              </label>
              <input
                {...fieldProps("actualFabricYds")}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 93.5"
                onChange={(e) => update("actualFabricYds", e.target.value)}
              />
              {fieldError("actualFabricYds")}
            </div>

            <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm">
              <p className="font-semibold">Fabric check</p>
              <p className="mt-1">
                Expected: {expectedFabric !== null ? formatYards(expectedFabric) : "—"}
              </p>
              <p>
                Projected wastage:{" "}
                <span
                  className={
                    wastage !== null && recipe && wastage > Number(recipe.wastage_cap)
                      ? "font-bold text-red-800"
                      : "font-semibold"
                  }
                >
                  {formatPct(wastage)}
                </span>
                {recipe && <span className="text-slate-700"> (cap {Number(recipe.wastage_cap)}%)</span>}
              </p>
            </div>
          </div>

          <section aria-labelledby="expected-heading">
            <h3 id="expected-heading" className="font-semibold">
              Expected component counts
            </h3>
            {recipe ? (
              <table className="mt-2 w-full text-left text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Pcs / garment</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Expected pieces</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {expectedComponentCounts(recipe.components, qty ?? 0).map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2">{c.component_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.pieces_per_garment}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {qty ? c.expected_qty : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-slate-700">
                Select a recipe to see the components to cut.
              </p>
            )}
          </section>

          {formError && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className={buttonClass.primary} disabled={submitting}>
              {submitting ? "Creating…" : "Create order"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
