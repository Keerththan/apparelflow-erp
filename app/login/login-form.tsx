"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import {
  buttonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/components/ui";
import demoUsers from "@/lib/demo-users.json";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { createClient } from "@/utils/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // With cacheComponents, Next.js hides this page with React <Activity>
  // instead of unmounting it after sign-in. Without this cleanup the page
  // came back after sign-out still "Signing in…" with every button
  // disabled. Also clears the password so it does not linger in the DOM.
  useLayoutEffect(() => {
    return () => {
      setPending(null);
      setError(null);
      setPassword("");
    };
  }, []);

  async function signIn(loginEmail: string, loginPassword: string) {
    setError(null);
    setPending(loginEmail);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (signInError) {
      setPending(null);
      setError(signInError.message);
      return;
    }
    // "/" resolves the role on the server and redirects to that workspace.
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="space-y-4 rounded-lg border border-slate-300 bg-white p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim() || !password) {
            setError("Email and password are required");
            return;
          }
          void signIn(email.trim(), password);
        }}
        noValidate
      >
        <h2 className="text-lg font-bold text-slate-900">Sign in</h2>
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className={`${inputClass} mt-1`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@factory.com"
          />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={`${inputClass} mt-1`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className={fieldErrorClass}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${buttonClass.primary} w-full`}
          disabled={pending !== null}
        >
          {pending === email.trim() ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <section
        aria-labelledby="demo-heading"
        className="rounded-lg border border-blue-300 bg-blue-50 p-6"
      >
        <h2 id="demo-heading" className="text-lg font-bold text-slate-900">
          Demo credential panel
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          Sign in as any factory persona. Permissions are enforced by the
          server, not by this panel.
        </p>
        <ul className="mt-4 space-y-3">
          {demoUsers.map((user) => (
            <li
              key={user.email}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-white p-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-slate-900">
                  {ROLE_LABELS[user.role as AppRole]}
                </p>
                <p className="break-all text-slate-700">{user.email}</p>
                <p className="font-mono text-slate-700">{user.password}</p>
              </div>
              <button
                type="button"
                className={buttonClass.secondary}
                disabled={pending !== null}
                onClick={() => void signIn(user.email, user.password)}
              >
                {pending === user.email ? "Signing in…" : "Sign in"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
