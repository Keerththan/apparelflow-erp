import { Suspense } from "react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatDateTime, formatYards } from "@/lib/format";
import { requireRole } from "@/lib/server/guards";
import { listOrders, listRecipes } from "@/lib/server/queries";
import { CreateOrderDialog } from "./create-order-dialog";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading orders…</p>}>
      <SupervisorWorkspace />
    </Suspense>
  );
}

async function SupervisorWorkspace() {
  await requireRole("cutting_supervisor");
  const [orders, recipes] = await Promise.all([listOrders(), listRecipes()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cutting Orders</h1>
          <p className="text-slate-700">
            Create batches from production recipes and send them to QC.
          </p>
        </div>
        <CreateOrderDialog recipes={recipes} />
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-400 bg-white p-8 text-center text-slate-700">
          No cutting orders yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                <th scope="col" className="px-4 py-3 font-semibold">Recipe</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Target qty</th>
                <th scope="col" className="px-4 py-3 font-semibold">Fabric roll</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Fabric used / std</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-900">
              {orders.map((order) => {
                const rejection = order.logs.find((l) => l.decision === "REJECTED");
                return (
                  <tr key={order.id} className="align-top">
                    <td className="px-4 py-3 font-mono font-semibold">{order.order_no}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{order.recipe.name}</div>
                      <div className="text-slate-700">{order.recipe.recipe_code}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{order.target_qty}</td>
                    <td className="px-4 py-3 font-mono">{order.fabric_roll_id}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatYards(order.actual_fabric_yds)}
                      <div className="text-slate-700">/ {formatYards(order.expected_fabric_yds)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                      {order.status === "REJECTED" && rejection && (
                        <p className="mt-2 max-w-xs text-sm text-red-900">
                          <span className="font-semibold">Reason:</span>{" "}
                          {rejection.rejection_note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {formatDateTime(order.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
