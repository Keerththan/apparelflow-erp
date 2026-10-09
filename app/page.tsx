import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ROLE_HOME } from "@/lib/roles";
import { getSessionUser } from "@/lib/server/auth";

export default function Home() {
  return (
    <Suspense
      fallback={<p className="p-6 text-slate-700">Loading your workspace…</p>}
    >
      <RedirectToWorkspace />
    </Suspense>
  );
}

async function RedirectToWorkspace(): Promise<never> {
  const user = await getSessionUser();
  redirect(user ? ROLE_HOME[user.role] : "/login");
}
