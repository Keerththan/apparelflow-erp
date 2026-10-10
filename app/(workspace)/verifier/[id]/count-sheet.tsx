"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrafficLightBadge } from "@/components/traffic-light-badge";
import {
  buttonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/components/ui";
import {
  componentStatus,
  verificationSummary,
} from "@/lib/domain/traffic-light";
import { parseRejectionNote, parseWholeNumber } from "@/lib/domain/validation";

type SheetItem = {
  id: string;
  name: string;
  piecesPerGarment: number;
  expectedQty: number;
  actualQty: number | null;
};

type Parsed = { value: number | null; error?: string };

function parseCount(raw: string): Parsed {
  if (raw.trim() === "") return { value: null };
  const result = parseWholeNumber(raw, { label: "Count", min: 0, max: 1_000_000 });
  return result.ok ? { value: result.value } : { value: null, error: result.error };
}

export function CountSheet({ orderId, items }: { orderId: string; items: SheetItem[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.actualQty?.toString() ?? ""])),
  );
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [pending, setPending] = useState<"save" | "approve" | "reject" | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  // Everything below is derived from `counts` on each render (no effects).
  const parsed = Object.fromEntries(
    items.map((i) => [i.id, parseCount(counts[i.id] ?? "")]),
  ) as Record<string, Parsed>;
  const hasInvalid = items.some((i) => parsed[i.id].error);
  const summary = verificationSummary(
    items.map((i) => ({ expected_qty: i.expectedQty, actual_qty: parsed[i.id].value })),
  );
  const canApprove = summary.canApprove && !hasInvalid;
  const noteResult = parseRejectionNote(note);

  const countedPayload = () =>
    items
      .filter((i) => parsed[i.id].value !== null)
      .map((i) => ({ itemId: i.id, actualQty: parsed[i.id].value }));

  async function send(
    action: "save" | "approve" | "reject",
    url: string,
    method: string,
    body: unknown,
  ) {
    setPending(action);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? `Request failed (${res.status})` });
        return false;
      }
      return true;
    } catch {
      setMessage({ kind: "error", text: "Network error — nothing was saved" });
      return false;
    } finally {
      setPending(null);
    }
  }

  async function save() {
    const ok = await send("save", `/api/orders/${orderId}/counts`, "PUT", {
      counts: items.map((i) => ({ itemId: i.id, actualQty: parsed[i.id].value })),
    });
    if (ok) {
      setMessage({ kind: "info", text: "Counts saved. You can resume this sheet later." });
      router.refresh();
    }
  }

  async function approve() {
    const ok = await send("approve", `/api/orders/${orderId}/approve`, "POST", {
      counts: countedPayload(),
    });
    if (ok) {
      router.push("/verifier");
      router.refresh();
    }
  }

  async function reject() {
    setNoteTouched(true);
    if (!noteResult.ok) return;
    const ok = await send("reject", `/api/orders/${orderId}/reject`, "POST", {
      note: noteResult.value,
      counts: countedPayload(),
    });
    if (ok) {
      router.push("/verifier");
      router.refresh();
    }
  }

  const blockedReason = hasInvalid
    ? "Fix the invalid counts first."
    : summary.RED > 0
      ? `${summary.RED} component(s) are short (RED). A shortage batch cannot be approved — reject it for re-cutting.`
      : summary.uncounted > 0
        ? `${summary.uncounted} component(s) still need to be counted.`
        : null;

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
        <table className="min-w-full text-left text-sm text-slate-900">
          <thead className="bg-slate-100">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Component</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Expected pieces</th>
              <th scope="col" className="px-4 py-3 font-semibold">Physical count</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Variance</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item) => {
              const p = parsed[item.id];
              const status = componentStatus(item.expectedQty, p.value);
              const variance = p.value === null ? null : p.value - item.expectedQty;
              const inputId = `count-${item.id}`;
              return (
                <tr key={item.id} className={status === "RED" ? "bg-red-50" : undefined}>
                  <td className="px-4 py-3">
                    <label htmlFor={inputId} className="font-medium">
                      {item.name}
                    </label>
                    <div className="text-slate-700">{item.piecesPerGarment} pcs / garment</div>
                  </td>
                  <td className="px-4 py-3 text-right text-base font-semibold tabular-nums">
                    {item.expectedQty}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      id={inputId}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className={`${inputClass} w-28 tabular-nums`}
                      value={counts[item.id] ?? ""}
                      aria-invalid={p.error ? true : undefined}
                      aria-describedby={p.error ? `${inputId}-error` : undefined}
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [item.id]: e.target.value }))
                      }
                    />
                    {p.error && (
                      <p id={`${inputId}-error`} className={fieldErrorClass}>
                        {p.error}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                  </td>
                  <td className="px-4 py-3">
                    <TrafficLightBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-900" aria-live="polite">
        <span className="font-semibold">{summary.GREEN}</span> match ·{" "}
        <span className="font-semibold">{summary.YELLOW}</span> excess ·{" "}
        <span className="font-semibold">{summary.RED}</span> short ·{" "}
        <span className="font-semibold">{summary.uncounted}</span> not counted
      </p>

      {blockedReason && (
        <p
          role="status"
          className={`rounded-md border p-3 text-sm font-medium ${
            summary.RED > 0
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-slate-300 bg-slate-50 text-slate-900"
          }`}
        >
          Approve Batch is disabled: {blockedReason}
        </p>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-md border p-3 text-sm font-medium ${
            message.kind === "error"
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-green-300 bg-green-50 text-green-900"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass.success}
          disabled={!canApprove || pending !== null}
          onClick={() => void approve()}
        >
          {pending === "approve" ? "Approving…" : "Approve Batch"}
        </button>
        <button
          type="button"
          className={buttonClass.danger}
          disabled={pending !== null}
          onClick={() => setShowReject((v) => !v)}
          aria-expanded={showReject}
          aria-controls="reject-panel"
        >
          Reject Batch…
        </button>
        <button
          type="button"
          className={buttonClass.secondary}
          disabled={hasInvalid || pending !== null}
          onClick={() => void save()}
        >
          {pending === "save" ? "Saving…" : "Save counts"}
        </button>
      </div>

      {showReject && (
        <section
          id="reject-panel"
          aria-labelledby="reject-heading"
          className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4"
        >
          <h2 id="reject-heading" className="font-bold text-red-900">
            Reject batch and return for re-cutting
          </h2>
          <div>
            <label htmlFor="rejection-note" className={labelClass}>
              Reason (required)
            </label>
            <textarea
              id="rejection-note"
              rows={3}
              className={`${inputClass} mt-1`}
              placeholder="e.g. Sleeve cuffs short by 4 pieces; fabric flaw on bundle 3"
              value={note}
              aria-invalid={noteTouched && !noteResult.ok ? true : undefined}
              aria-describedby={noteTouched && !noteResult.ok ? "rejection-note-error" : undefined}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => setNoteTouched(true)}
            />
            {noteTouched && !noteResult.ok && (
              <p id="rejection-note-error" className={fieldErrorClass}>
                {noteResult.error}
              </p>
            )}
          </div>
          <button
            type="button"
            className={buttonClass.danger}
            disabled={pending !== null}
            onClick={() => void reject()}
          >
            {pending === "reject" ? "Rejecting…" : "Confirm rejection"}
          </button>
        </section>
      )}
    </div>
  );
}
