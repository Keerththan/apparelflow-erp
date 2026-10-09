import { Suspense } from "react";
import { requireRole } from "@/lib/server/guards";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-slate-700">Loading…</p>}>
      <VerifierWorkspace />
    </Suspense>
  );
}

async function VerifierWorkspace() {
  await requireRole("cutting_verifier");
  return (
    <h1 className="text-2xl font-bold text-slate-900">Verification Terminal</h1>
  );
}
