import { DISCUSSIONS, SELF_HOST, SIGN_UP } from "@/lib/site";
import { ArrowIcon } from "./Icons";

/**
 * Mirrors the launch catalogue in packages/core/src/platform/plans.ts (spec 12 §12.5):
 * per active unit per month, marginal volume tiers, billed on the month's peak.
 * Prices in EUR, excluding VAT.
 */
const plans = [
  {
    key: "starter",
    name: "Starter",
    who: "Up to 25 units, one team.",
    tiers: [{ from: 1, price: 9 }],
    annual: 15,
    support: "€49 / month add-on",
    limits: { properties: "10", units: "25", users: "5", api: "120 / min", retention: "400 days" },
  },
  {
    key: "growth",
    name: "Growth",
    who: "Managers with 25 to 300 units and owners to report to.",
    tiers: [
      { from: 1, price: 8 },
      { from: 51, price: 6.5 },
      { from: 201, price: 5 },
    ],
    annual: 15,
    support: "€99 / month add-on",
    limits: {
      properties: "300",
      units: "1,000",
      users: "50",
      api: "600 / min",
      retention: "3 years",
    },
    featured: true,
  },
  {
    key: "scale",
    name: "Scale",
    who: "Large portfolios and hotel groups.",
    tiers: [
      { from: 1, price: 7 },
      { from: 201, price: 4.5 },
      { from: 1001, price: 3 },
    ],
    annual: 20,
    support: "Included",
    limits: {
      properties: "Unlimited",
      units: "Unlimited",
      users: "Unlimited",
      api: "3,000 / min",
      retention: "Unlimited",
    },
  },
];

const included = [
  "Channel manager: Airbnb, Booking.com, Expedia and 40+ OTAs through Channex",
  "Portfolio calendar with rates, restrictions and bulk updates",
  "Reservations with every revision kept, never a booking lost",
  "Turnover tasks, cleaner app, maintenance, door codes",
  "Unified inbox, templates and message automation",
  "Owner agreements, statements, payouts and owner portal",
  "Direct booking engine, widget and guest portal",
  "Dashboards, reports, alerts and scheduled exports",
  "REST API, webhooks and TypeScript SDK",
  "Console in English, French and Arabic",
];

const eur = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);

function tierLabel(from: number, next: number | undefined) {
  if (from === 1 && next === undefined) return "every unit";
  if (from === 1) return `units 1 to ${next! - 1}`;
  if (next === undefined) return `from unit ${from}`;
  return `units ${from} to ${next - 1}`;
}

const faqs = [
  {
    q: "What counts as an active unit?",
    a: "A unit that can take a booking on any day of the month: an apartment, a house, or one hotel room. Unlisted, archived and out-of-service units are not counted. We meter nightly and bill on the month's peak, so a unit you add on the 20th is billed for that month once.",
  },
  {
    q: "How do the tiers work?",
    a: "Tiers are marginal, like tax brackets. On Growth with 80 units you pay 50 units at €8 and 30 units at €6.50, which is €595 a month. Nothing jumps when you cross a boundary.",
  },
  {
    q: "What happens after the trial?",
    a: "Your trial lasts fourteen days and needs no card. Choose a plan and add a card before it ends to keep going. If you do not, the organisation is paused with everything intact and you can pick it up later. Channel sync and booking intake keep running through the grace period so nothing is lost.",
  },
  {
    q: "Is VAT included?",
    a: "Prices exclude VAT. Businesses in the EU with a valid VAT number are invoiced with reverse charge. German customers and consumers pay VAT at the local rate on top.",
  },
  {
    q: "Do I need my own Channex.io account?",
    a: "Not on the hosted service: connectivity is part of every plan. When you self-host you bring your own Channex account and pay Channex directly.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Any time, from Settings → Billing. Upgrades apply immediately and are prorated. Downgrades and cancellations take effect at the end of the period. Your data stays exportable throughout.",
  },
];

export function Pricing() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 -z-10" aria-hidden="true" />
        <div className="glow absolute inset-x-0 top-0 -z-10 h-[420px]" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-20 lg:pt-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-mint">Pricing</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Pay per active unit. <span className="gradient-text">Everything included.</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-fg-muted">
              One price per unit per month, billed on the month&apos;s peak. The booking engine and
              the owner portal are part of every plan, not upsells. Fourteen days free, no card
              needed. Or self-host for nothing.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((p) => (
            <article
              key={p.key}
              className={`relative flex flex-col rounded-3xl border p-7 ${
                p.featured
                  ? "border-mint/60 bg-mint/5 shadow-2xl shadow-mint/10"
                  : "border-line bg-panel"
              }`}
            >
              {p.featured ? (
                <span className="absolute -top-3 left-7 rounded-full bg-gradient-to-r from-mint to-sky px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-ink">
                  Most portfolios
                </span>
              ) : null}
              <h2 className="text-xl font-bold text-white">{p.name}</h2>
              <p className="mt-1 text-sm text-fg-muted">{p.who}</p>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold tracking-tight text-white">
                  {eur(p.tiers[0].price)}
                </span>
                <span className="text-sm text-fg-muted">per unit / month</span>
              </p>
              <ul className="mt-5 space-y-1.5 text-sm">
                {p.tiers.map((t, i) => (
                  <li key={t.from} className="flex justify-between gap-4 text-fg-muted">
                    <span>{tierLabel(t.from, p.tiers[i + 1]?.from)}</span>
                    <span className="font-semibold text-white">{eur(t.price)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-5 text-sm">
                <dt className="text-fg-muted">Properties</dt>
                <dd className="text-right font-semibold text-white">{p.limits.properties}</dd>
                <dt className="text-fg-muted">Units</dt>
                <dd className="text-right font-semibold text-white">{p.limits.units}</dd>
                <dt className="text-fg-muted">Users</dt>
                <dd className="text-right font-semibold text-white">{p.limits.users}</dd>
                <dt className="text-fg-muted">API requests</dt>
                <dd className="text-right font-semibold text-white">{p.limits.api}</dd>
                <dt className="text-fg-muted">Data retention</dt>
                <dd className="text-right font-semibold text-white">{p.limits.retention}</dd>
                <dt className="text-fg-muted">Priority support</dt>
                <dd className="text-right font-semibold text-white">{p.support}</dd>
                <dt className="text-fg-muted">Paid yearly</dt>
                <dd className="text-right font-semibold text-mint">{p.annual}% off</dd>
              </dl>
              <a
                href={SIGN_UP}
                className={`mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition ${
                  p.featured
                    ? "bg-gradient-to-r from-mint to-sky text-ink shadow-lg shadow-mint/20 hover:brightness-110"
                    : "border border-line bg-panel-2 text-white hover:border-mint/60"
                }`}
              >
                Start free
                <ArrowIcon />
              </a>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-5 rounded-3xl border border-line bg-ink-2/60 p-7 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Self-hosted: free</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
              The same release, on your own servers, under the Sustainable Use License. Docker
              Compose, Postgres and Redis, your own Channex.io account. No feature is held back and
              no unit is counted.
            </p>
          </div>
          <a
            href={SELF_HOST}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-panel px-5 py-3 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
          >
            Read the install guide
            <ArrowIcon />
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-mint">
              In every plan
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
              The whole product, from the first unit.
            </h2>
            <p className="mt-4 leading-relaxed text-fg-muted">
              Plans differ in volume price and limits, never in features. A five-unit Starter
              account runs the same channel manager, inbox and owner statements as a thousand-unit
              Scale account.
            </p>
            <div className="mt-8 rounded-2xl border border-line bg-panel p-5 text-sm">
              <p className="font-semibold text-white">Worked example</p>
              <p className="mt-2 leading-relaxed text-fg-muted">
                A manager with 80 apartments on Growth: 50 units at €8 and 30 units at €6.50 is{" "}
                <span className="font-semibold text-white">€595 a month</span>, or{" "}
                <span className="font-semibold text-white">€505.75</span> paid yearly. Add ten units
                in July and July is billed at 90.
              </p>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {included.map((f) => (
              <li
                key={f}
                className="flex items-start gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-fg"
              >
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint/15 text-mint"
                  aria-hidden="true"
                >
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line bg-ink-2/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold tracking-tight text-white">Billing questions.</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-line bg-panel p-6 open:border-mint/40"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-white marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span
                      className="text-fg-muted transition group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-sm text-fg-muted">
            Something else, or more than a thousand units?{" "}
            <a href={DISCUSSIONS} className="text-mint underline-offset-4 hover:underline">
              Talk to us
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
