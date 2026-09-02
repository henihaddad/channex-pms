import Link from "next/link";

/** Rendered with a 403 status by `forbidden()` (spec 02 RBAC-7: denied, never leaked). */
export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-rose-600">403</p>
      <h1 className="mt-2 text-2xl font-bold">Permission denied</h1>
      <p className="mt-3 text-slate-600">
        Your role does not include the permission this page needs. Ask an organization admin to
        grant it.
      </p>
      <Link href="/" className="mt-6 inline-block text-emerald-700 underline">
        Back to the dashboard
      </Link>
    </main>
  );
}
