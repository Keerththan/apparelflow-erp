import { Suspense } from "react";
import { requireRole } from "@/lib/server/guards";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading…</p>}>
      <SewingWorkspace />
    </Suspense>
  );
}

async function SewingWorkspace() {
  await requireRole("sewing_supervisor");
  return (
    <h1 className="text-2xl font-bold text-slate-900">Sewing Queue</h1>
  );
}
