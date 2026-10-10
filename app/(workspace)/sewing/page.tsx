import { Suspense } from "react";
import { TrafficLightBadge } from "@/components/traffic-light-badge";
import { formatDateTime, formatPct, formatYards } from "@/lib/format";
import { requireRole } from "@/lib/server/guards";
import { getSewingQueue, listSewingInProgress } from "@/lib/server/queries";
import { StartSewingButton } from "./start-sewing-button";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading sewing queue…</p>}>
      <SewingWorkspace />
    </Suspense>
  );
}

async function SewingWorkspace() {
  await requireRole("sewing_supervisor");
  const [queue, onLine] = await Promise.all([getSewingQueue(), listSewingInProgress()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sewing Queue</h1>
        <p className="text-slate-700">
          Only batches that passed component-by-component verification are
          released to the assembly floor.
        </p>
      </div>

      <section aria-labelledby="queue-heading" className="space-y-4">
        <h2 id="queue-heading" className="text-lg font-bold text-slate-900">
          Verified batches ready for assembly ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-400 bg-white p-6 text-center text-slate-700">
            No verified batches are waiting.
          </p>
        ) : (
          <ul className="space-y-4">
            {queue.map((order) => {
              const overCap = order.wastage_pct > Number(order.recipe.wastage_cap);
              return (
                <li key={order.id} className="rounded-lg border border-slate-300 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        <span className="font-mono">{order.order_no}</span> · {order.recipe.name}
                      </h3>
                      <p className="text-slate-700">
                        {order.recipe.recipe_code} · {order.target_qty} garments · roll{" "}
                        <span className="font-mono">{order.fabric_roll_id}</span>
                      </p>
                      <p className="mt-1 text-slate-900">
                        Verified by{" "}
                        <span className="font-semibold">{order.verified_by.full_name}</span> on{" "}
                        {formatDateTime(order.verified_at)}
                      </p>
                      <p className="text-slate-900">
                        Fabric {formatYards(order.actual_fabric_yds)} /{" "}
                        {formatYards(order.expected_fabric_yds)} · wastage{" "}
                        <span className={overCap ? "font-bold text-red-800" : "font-semibold"}>
                          {formatPct(order.wastage_pct)}
                        </span>{" "}
                        <span className="text-slate-700">
                          (cap {Number(order.recipe.wastage_cap)}%{overCap ? " — over cap" : ""})
                        </span>
                      </p>
                    </div>
                    <StartSewingButton orderId={order.id} orderNo={order.order_no} />
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-slate-900">
                      <caption className="sr-only">Verified piece counts for {order.order_no}</caption>
                      <thead className="bg-slate-100">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">Expected</th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">Counted</th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">Variance</th>
                          <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {order.components.map((c) => (
                          <tr key={c.component_name}>
                            <td className="px-3 py-2">{c.component_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.expected_qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.actual_qty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {c.variance > 0 ? `+${c.variance}` : c.variance}
                            </td>
                            <td className="px-3 py-2"><TrafficLightBadge status={c.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <details className="mt-3 text-sm text-slate-900">
                    <summary className="cursor-pointer font-semibold text-blue-800">
                      Verifier audit notes ({order.audit_notes.length})
                    </summary>
                    <ol className="mt-2 space-y-1">
                      {order.audit_notes.map((note) => (
                        <li key={note.created_at}>
                          <span className="font-semibold">{note.decision}</span> by {note.verifier} ·{" "}
                          {formatDateTime(note.created_at)}
                          {note.rejection_note && (
                            <span className="text-red-900"> — {note.rejection_note}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="line-heading" className="space-y-3">
        <h2 id="line-heading" className="text-lg font-bold text-slate-900">
          On the assembly line ({onLine.length})
        </h2>
        {onLine.length === 0 ? (
          <p className="text-slate-700">No batches in assembly yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
            {onLine.map((order) => (
              <li key={order.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm text-slate-900">
                <span>
                  <span className="font-mono font-semibold">{order.order_no}</span> ·{" "}
                  {order.recipe.name} · {order.target_qty} garments
                </span>
                <span className="text-slate-700">
                  Started by {order.starter?.full_name ?? "—"} ·{" "}
                  {formatDateTime(order.sewing_started_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
