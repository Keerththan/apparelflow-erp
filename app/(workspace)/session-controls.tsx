"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { buttonClass, inputClass, optionClass } from "@/components/ui";
import demoUsers from "@/lib/demo-users.json";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { createClient } from "@/utils/supabase/client";

export function SessionControls({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After sign-out the workspace is hidden by React <Activity>, not
  // unmounted; reset so signing back in as the same user is not stuck busy.
  useLayoutEffect(() => {
    return () => {
      setBusy(false);
      setError(null);
    };
  }, []);

  async function switchPersona(email: string) {
    const persona = demoUsers.find((u) => u.email === email);
    if (!persona || email === currentEmail) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.signOut();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: persona.email,
      password: persona.password,
    });
    if (signInError) {
      setBusy(false);
      setError(signInError.message);
      router.replace("/login");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    setBusy(true);
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setBusy(false);
      setError(signOutError.message);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const isDemoUser = demoUsers.some((u) => u.email === currentEmail);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDemoUser && (
        <label className="flex items-center gap-2 text-sm font-semibold text-white">
          <span>Persona</span>
          <select
            className={`${inputClass} w-auto py-1.5 text-sm`}
            value={currentEmail}
            disabled={busy}
            onChange={(e) => void switchPersona(e.target.value)}
          >
            {demoUsers.map((u) => (
              <option key={u.email} value={u.email} className={optionClass}>
                {ROLE_LABELS[u.role as AppRole]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className={`${buttonClass.secondary} py-1.5`}
        disabled={busy}
        onClick={() => void signOut()}
      >
        Sign out
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
