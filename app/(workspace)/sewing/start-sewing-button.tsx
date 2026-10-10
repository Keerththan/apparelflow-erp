"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function StartSewingButton({ orderId, orderNo }: { orderId: string; orderNo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/start-sewing`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — assembly not started");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={buttonClass.primary}
        disabled={pending}
        onClick={() => void start()}
        aria-label={`Start sewing assembly for ${orderNo}`}
      >
        {pending ? "Starting…" : "Start Sewing Assembly"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
