import Link from "next/link";
import { Suspense } from "react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/server/guards";
import { listOrders } from "@/lib/server/queries";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading QC queue…</p>}>
      <VerifierWorkspace />
    </Suspense>
  );
}

async function VerifierWorkspace() {
  await requireRole("cutting_verifier");
  const orders = await listOrders();
  const pending = orders
    .filter((o) => o.status === "PENDING_VERIFICATION")
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const decided = orders
    .filter((o) => o.logs.length > 0)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Verification Terminal</h1>
        <p className="text-slate-700">
          Count every component of each bundle. A batch can only be approved
          when no component is short.
        </p>
      </div>

      <section aria-labelledby="queue-heading" className="space-y-3">
        <h2 id="queue-heading" className="text-lg font-bold text-slate-900">
          Waiting for QC ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-400 bg-white p-6 text-center text-slate-700">
            No batches are waiting for verification.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((order) => (
              <li
                key={order.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-900">{order.order_no}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="text-slate-900">
                  {order.recipe.name}{" "}
                  <span className="text-slate-700">({order.recipe.recipe_code})</span>
                </p>
                <p className="text-sm text-slate-700">
                  {order.target_qty} garments · roll {order.fabric_roll_id}
                </p>
                <p className="text-sm text-slate-700">
                  Submitted {formatDateTime(order.submitted_at)}
                </p>
                <Link
                  href={`/verifier/${order.id}`}
                  className={`${buttonClass.primary} mt-1`}
                >
                  Open count sheet
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="text-lg font-bold text-slate-900">
          Recent decisions
        </h2>
        {decided.length === 0 ? (
          <p className="text-slate-700">No decisions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
            <table className="min-w-full text-left text-sm text-slate-900">
              <thead className="bg-slate-100">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Recipe</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Current status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {decided.map((order) => {
                  const last = order.logs[0];
                  return (
                    <tr key={order.id}>
                      <td className="px-4 py-3 font-mono font-semibold">
                        <Link href={`/verifier/${order.id}`} className="text-blue-800 underline">
                          {order.order_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{order.recipe.name}</td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3">
                        {last.decision} by {last.verifier?.full_name ?? "—"}
                        <div className="text-slate-700">{formatDateTime(last.created_at)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
