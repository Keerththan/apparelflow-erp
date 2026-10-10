import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { TrafficLightBadge } from "@/components/traffic-light-badge";
import { formatDateTime, formatPct, formatYards } from "@/lib/format";
import { requireRole } from "@/lib/server/guards";
import { getOrderDetail } from "@/lib/server/queries";
import { CountSheet } from "./count-sheet";

export default function Page({ params }: PageProps<"/verifier/[id]">) {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading count sheet…</p>}>
      <VerificationOrder params={params} />
    </Suspense>
  );
}

async function VerificationOrder({
  params,
}: {
  params: PageProps<"/verifier/[id]">["params"];
}) {
  await requireRole("cutting_verifier");
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <Link href="/verifier" className="text-sm font-semibold text-blue-800 underline">
        ← Back to QC queue
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            <span className="font-mono">{order.order_no}</span> · {order.recipe.name}
          </h1>
          <p className="text-slate-700">
            {order.recipe.recipe_code} · {order.target_qty} garments · roll{" "}
            <span className="font-mono">{order.fabric_roll_id}</span> · cut by{" "}
            {order.creator?.full_name ?? "—"}
          </p>
          <p className="text-slate-700">
            Fabric used {formatYards(order.actual_fabric_yds)} of{" "}
            {formatYards(order.expected_fabric_yds)} standard (wastage cap{" "}
            {Number(order.recipe.wastage_cap)}%)
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      {order.status === "PENDING_VERIFICATION" ? (
        <CountSheet
          orderId={order.id}
          items={order.items.map((item) => ({
            id: item.id,
            name: item.component.component_name,
            piecesPerGarment: item.component.pieces_per_garment,
            expectedQty: item.expected_qty,
            actualQty: item.actual_qty,
          }))}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
          <table className="min-w-full text-left text-sm text-slate-900">
            <thead className="bg-slate-100">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Component</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Expected</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Counted</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{item.component.component_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.expected_qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.actual_qty ?? "—"}</td>
                  <td className="px-4 py-3"><TrafficLightBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="audit-heading" className="space-y-2">
        <h2 id="audit-heading" className="text-lg font-bold text-slate-900">Audit trail</h2>
        {order.logs.length === 0 ? (
          <p className="text-slate-700">No QC decisions recorded for this batch yet.</p>
        ) : (
          <ol className="space-y-2">
            {order.logs.map((log) => (
              <li
                key={log.created_at}
                className="rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900"
              >
                <span className="font-bold">{log.decision}</span> by{" "}
                {log.verifier?.full_name ?? "—"} · {formatDateTime(log.created_at)}
                {log.decision === "APPROVED" && <> · wastage {formatPct(log.wastage_pct)}</>}
                {log.rejection_note && (
                  <p className="mt-1 text-red-900">
                    <span className="font-semibold">Reason:</span> {log.rejection_note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
