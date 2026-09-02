const stats = [
  { value: "17", label: "specification documents, public from day one" },
  { value: "15", label: "personas with scoped permissions, owner to cleaner" },
  { value: "40+", label: "OTAs reachable through Channex.io" },
  { value: "0", label: "bookings silently lost, by design and by test" },
];

export function Proof() {
  return (
    <section className="border-y border-line bg-ink-2/60">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="order-last text-sm text-fg-muted">{s.label}</dt>
            <dd className="text-3xl font-extrabold tracking-tight text-white">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
