import { ROADMAP } from "@/lib/site";
import { ArrowIcon } from "./Icons";
import { Section } from "./Section";

const milestones = [
  { id: "M0", title: "Foundations", body: "Monorepo, CI, Compose, domain value objects, generated permission matrix.", state: "next" },
  { id: "M1", title: "Connectivity core", body: "Channex adapter, ARI engine, fake provider, property-based tests. Highest risk, done first." },
  { id: "M2", title: "Inventory and calendar", body: "Portfolio calendar, rates, restrictions, channel connection. First release design partners can run." },
  { id: "M3", title: "Reservations and operations", body: "Booking ingestion and revisions, turnovers, cleaner app, access codes, front desk." },
  { id: "M4", title: "Messaging", body: "Unified inbox, templates, automation, SLAs." },
  { id: "M5", title: "Owners", body: "Agreements, statements, expenses, payouts, owner portal." },
  { id: "M6", title: "Dashboards", body: "Occupancy, ADR, RevPAR, pace, channel mix, per role." },
  { id: "M7", title: "Direct booking engine", body: "Multi-property search, payments, guest portal." },
  { id: "M8", title: "Hosted service and v1.0", body: "Billing, quotas, operator console, hardening, certification." },
];

export function Roadmap() {
  return (
    <Section
      id="roadmap"
      eyebrow="Roadmap"
      title="Nine milestones to v1.0. Each one usable on its own."
      lead="Design partners ride the early releases on real portfolios while later milestones are built. The full plan, including what each milestone deliberately leaves out, is public."
    >
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {milestones.map((m) => (
          <li key={m.id} className={`rounded-2xl border p-5 ${m.state === "next" ? "border-mint/50 bg-mint/5" : "border-line bg-panel"}`}>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-mint">{m.id}</span>
              <h3 className="font-bold text-white">{m.title}</h3>
              {m.state === "next" ? (
                <span className="ml-auto rounded-full bg-amber/20 px-2 py-0.5 text-[11px] font-semibold text-amber">next</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{m.body}</p>
          </li>
        ))}
      </ol>
      <a href={ROADMAP} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-mint hover:underline">
        Read the full roadmap
        <ArrowIcon />
      </a>
    </Section>
  );
}
