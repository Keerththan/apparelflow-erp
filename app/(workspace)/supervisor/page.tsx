import { Suspense } from "react";
import { requireRole } from "@/lib/server/guards";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading…</p>}>
      <SupervisorWorkspace />
    </Suspense>
  );
}

async function SupervisorWorkspace() {
  await requireRole("cutting_supervisor");
  return (
    <h1 className="text-2xl font-bold text-slate-900">Cutting Orders</h1>
  );
}
