import { Section } from "./Section";

const steps = [
  {
    n: "01",
    title: "Connect Channex",
    body: "Bring your Channex.io account, or let the hosted service provision one. Channex holds the certified two-way OTA adapters, ARI delivery and booking normalisation.",
  },
  {
    n: "02",
    title: "Onboard the portfolio",
    body: "Import listings from Airbnb, clone from templates, bulk-map channels. Onboarding listing 2 through 40 is the cost that dominates everything, so it is under three minutes each.",
  },
  {
    n: "03",
    title: "Run the operation",
    body: "One calendar for every listing, rates and restrictions without spreadsheets, turnovers assigned, guests answered, statements generated. Local state is authoritative; the provider is a mirror we keep verifying.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="Channex is the connectivity layer. We are the product layer."
      lead="Every closed vendor rebuilds the OTA plumbing and then runs out of budget for the product. We skip the plumbing."
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <ol className="space-y-6">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-5">
              <span className="mt-1 h-fit rounded-lg bg-panel-2 px-2.5 py-1 font-mono text-sm font-bold text-mint">{s.n}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <figure className="rounded-2xl border border-line bg-panel p-6 font-mono text-sm" aria-label="Architecture diagram">
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {["Booking.com", "Airbnb", "Vrbo", "Expedia", "Agoda", "40+ more"].map((c) => (
              <span key={c} className="rounded-full border border-line bg-ink px-3 py-1 text-fg-muted">
                {c}
              </span>
            ))}
          </div>
          <div className="my-3 text-center text-fg-muted">│ certified two-way connections</div>
          <div className="rounded-xl border border-sky/40 bg-sky/10 p-4 text-center">
            <p className="font-bold text-white">Channex.io</p>
            <p className="mt-1 text-xs text-fg-muted">OTA adapters · ARI · bookings · messaging · reviews</p>
          </div>
          <div className="my-3 text-center text-fg-muted">│ REST + webhooks, behind a provider port</div>
          <div className="rounded-xl border border-mint/50 bg-mint/10 p-4 text-center">
            <p className="font-bold text-white">Channex PMS</p>
            <p className="mt-1 text-xs text-fg-muted">
              calendar · rates · roles · turnovers · inbox · owners · booking engine · dashboards
            </p>
          </div>
          <figcaption className="mt-4 text-center text-xs text-fg-muted">
            Modular monolith: Next.js app plus a Node worker, PostgreSQL and Redis. Runs on one box.
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
