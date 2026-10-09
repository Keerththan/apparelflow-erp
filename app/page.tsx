export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
        ApparelFlow ERP
      </p>
      <h1 className="text-3xl font-bold text-slate-900">
        Cutting Operations &amp; Gatekeeper Verification Terminal
      </h1>
      <p className="text-slate-700">
        Cut batches are verified component-by-component before they can be
        released to the Sewing Queue.
      </p>
    </main>
  );
}
