import { DateRange, LocalDate, Money } from "@pms/core";

export default function Home() {
  const stay = DateRange.of(LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 13));
  const nightly = Money.parse("120.00", "EUR");
  const total = nightly.multiply(stay.nights());
  const [owner, manager] = total.allocate([80, 20]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">
        Milestone M0
      </p>
      <h1 className="mt-2 text-3xl font-bold">Channex PMS console</h1>
      <p className="mt-3 text-slate-600">
        The application scaffold. Identity, tenancy and the permission matrix land here during M0.
      </p>
      <dl className="mt-8 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-6 text-sm">
        <dt className="text-slate-500">Stay</dt>
        <dd className="font-mono">{stay.toString()}</dd>
        <dt className="text-slate-500">Nights</dt>
        <dd className="font-mono">{stay.nights()}</dd>
        <dt className="text-slate-500">Total</dt>
        <dd className="font-mono">{total.toString()}</dd>
        <dt className="text-slate-500">Owner 80%</dt>
        <dd className="font-mono">{owner?.toString()}</dd>
        <dt className="text-slate-500">Manager 20%</dt>
        <dd className="font-mono">{manager?.toString()}</dd>
      </dl>
      <p className="mt-6 text-xs text-slate-500">
        Computed by @pms/core, the framework-free domain layer.
      </p>
    </main>
  );
}
