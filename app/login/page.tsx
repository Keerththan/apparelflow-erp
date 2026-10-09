import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | ApparelFlow ERP",
};

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">
        ApparelFlow ERP
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
        Cutting Operations &amp; Gatekeeper Verification Terminal
      </h1>
      <p className="mt-2 max-w-2xl text-slate-700">
        Cut batches are verified component-by-component before they can be
        released to the Sewing Queue.
      </p>
      <div className="mt-8">
        <LoginForm />
      </div>
    </main>
  );
}
