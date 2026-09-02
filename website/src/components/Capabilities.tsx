import { Section } from "./Section";

const items = [
  {
    title: "Portfolio-first channel manager",
    body: "Connect OTAs, map inventory, push rates and availability, watch channel health. Every screen defaults to all your listings, and it holds up at 200 of them.",
  },
  {
    title: "Reservations with a memory",
    body: "Every OTA booking with its full revision history, reconciled continuously. Duplicate webhooks, out-of-order revisions and provider outages are tested, not hoped against.",
  },
  {
    title: "Turnover operations",
    body: "Cleaning coordination, same-day changeovers, cleaner routing, access codes, self check-in and maintenance. Hotel-kind properties get a real front desk instead.",
  },
  {
    title: "Unified guest inbox",
    body: "Booking.com, Airbnb and Expedia conversations in one place, with templates, automation, pre-arrival flows and response-time SLAs.",
  },
  {
    title: "Owner management",
    body: "Agreements, auto-generated monthly statements, expenses, payouts and an owner portal. The module no channel manager ships, and the biggest reason to switch.",
  },
  {
    title: "Direct booking engine",
    body: "Commission-free, multi-property search, server-rendered for speed and search. Treated as a first-class channel, not an afterthought.",
  },
  {
    title: "Dashboards per role",
    body: "Occupancy, ADR, RevPAR, pace and channel mix, answered without exporting to Excel. Owners see their units, managers see the portfolio.",
  },
  {
    title: "Fifteen real roles",
    body: "From org owner to revenue manager to cleaner to property owner. Scoped grants, so a cleaner is never one click from deleting a rate plan. Everything audited.",
  },
];

export function Capabilities() {
  return (
    <Section
      id="capabilities"
      eyebrow="Capabilities"
      title="One platform for the whole operation."
      lead="Everything the closed vendors do, done properly, plus the owner module none of them have."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <article key={it.title} className="group rounded-2xl border border-line bg-panel p-6 transition hover:border-mint/50">
            <span className="font-mono text-xs text-fg-muted">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 text-base font-bold text-white">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{it.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
