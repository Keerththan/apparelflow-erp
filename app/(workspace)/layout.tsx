import Link from "next/link";
import { Suspense } from "react";
import { ROLE_LABELS } from "@/lib/roles";
import { getSessionUser } from "@/lib/server/auth";
import { SessionControls } from "./session-controls";

export default function WorkspaceLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <>
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="font-bold tracking-tight text-white">
            ApparelFlow ERP
            <span className="ml-2 font-normal text-slate-300">
              Cutting Gatekeeper
            </span>
          </Link>
          <Suspense fallback={null}>
            <SessionBar />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </>
  );
}

async function SessionBar() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="text-sm">
        <span className="font-semibold">{user.fullName}</span>
        <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900">
          {ROLE_LABELS[user.role]}
        </span>
      </p>
      {/* Keyed by user: this layout survives a persona switch, so without
          a key the controls kept their "busy" state and stayed disabled. */}
      <SessionControls key={user.email} currentEmail={user.email} />
    </div>
  );
}
