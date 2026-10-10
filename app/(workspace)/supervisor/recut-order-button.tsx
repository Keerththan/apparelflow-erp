"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  buttonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/components/ui";
import { parseFabricYards } from "@/lib/domain/validation";

export function RecutOrderButton({
  orderId,
  orderNo,
  currentFabricYds,
  rejectionNote,
}: {
  orderId: string;
  orderNo: string;
  currentFabricYds: number;
  rejectionNote: string | null;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fabric, setFabric] = useState(String(currentFabricYds));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parsed = parseFabricYards(fabric);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/recut`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualFabricYds: parsed.value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("Network error — not re-cut");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${buttonClass.secondary} px-3 py-1.5`}
        onClick={() => {
          setFabric(String(currentFabricYds));
          setError(null);
          dialogRef.current?.showModal();
        }}
      >
        Re-cut
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`recut-${orderId}-title`}
        className="m-auto w-[min(100%-2rem,32rem)] rounded-lg border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/60"
      >
        <form onSubmit={confirm} noValidate className="space-y-4 p-6">
          <h2 id={`recut-${orderId}-title`} className="text-lg font-bold">
            Re-cut {orderNo}
          </h2>
          {rejectionNote && (
            <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <span className="font-semibold">Verifier reason:</span> {rejectionNote}
            </p>
          )}
          <p className="text-sm text-slate-700">
            The batch returns to cutting and every component will be counted
            again. The rejection stays in the audit trail.
          </p>
          <div>
            <label htmlFor={`recut-${orderId}-fabric`} className={labelClass}>
              Total fabric used after re-cut (yards)
            </label>
            <input
              id={`recut-${orderId}-fabric`}
              type="text"
              inputMode="decimal"
              className={`${inputClass} mt-1`}
              value={fabric}
              aria-invalid={!parsed.ok ? true : undefined}
              aria-describedby={!parsed.ok ? `recut-${orderId}-fabric-error` : undefined}
              onChange={(e) => setFabric(e.target.value)}
            />
            {!parsed.ok && (
              <p id={`recut-${orderId}-fabric-error`} className={fieldErrorClass}>
                {parsed.error}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-800">
              {error}
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
            <button
              type="submit"
              className={buttonClass.primary}
              disabled={!parsed.ok || pending}
            >
              {pending ? "Re-cutting…" : "Return to cutting"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
