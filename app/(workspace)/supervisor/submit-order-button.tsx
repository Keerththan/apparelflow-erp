"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function SubmitOrderButton({
  orderId,
  orderNo,
}: {
  orderId: string;
  orderNo: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/submit`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — not submitted");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={`${buttonClass.primary} px-3 py-1.5`}
        disabled={pending}
        onClick={() => void submit()}
        aria-label={`Submit ${orderNo} for verification`}
      >
        {pending ? "Submitting…" : "Submit to QC"}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-xs text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
