/**
 * What this product actually connects to, and how far each one is built
 * (spec 12 §12.7). Written down in one place because the honest answer is a selling
 * point: every competitor's integrations page lists logos, and a manager cannot tell
 * which ones work. Ours says `built`, `partial`, `port` or `planned`, and the console
 * reads the runtime to say whether the built ones are configured here.
 *
 * Persona: the `org_owner` deciding whether this product reaches their tools.
 */

export type IntegrationStatus =
  /** A real adapter ships and is covered by tests. */
  | "built"
  /** Part of it works without a vendor; the rest is a plugin. */
  | "partial"
  /** The interface exists with a working stand-in; a vendor adapter is a plugin. */
  | "port"
  /** Named in the roadmap, not written. */
  | "planned";

export interface IntegrationEntry {
  key: string;
  /** The vendor or category, as a manager would say it. */
  name: string;
  /** What it does for them, in one sentence. */
  summary: string;
  status: IntegrationStatus;
  /** Where it is set up in the console, when it is set up here at all. */
  href?: string;
  /** The port an adapter implements, for someone writing one. */
  port?: string;
  /** The spec section that defines it. */
  spec: string;
  /**
   * Whether this one depends on deployment configuration (an API key, a transport). The
   * console asks the container and says "not configured here" rather than implying it is
   * running.
   */
  configurable?: boolean;
}

export const INTEGRATIONS: readonly IntegrationEntry[] = [
  {
    key: "channex",
    name: "Channex",
    summary:
      "Every channel: availability and rates out, bookings, messages and reviews in. The one connection the product is built on.",
    status: "built",
    href: "/channels",
    port: "ConnectivityProvider",
    spec: "05",
  },
  {
    key: "stripe_payments",
    name: "Stripe (guest payments)",
    summary: "Cards for direct bookings, deposits and instalments, with refunds on cancellation.",
    status: "built",
    href: "/booking-engine/payments",
    port: "PaymentProvider",
    spec: "10 §10.4",
    configurable: true,
  },
  {
    key: "stripe_connect",
    name: "Stripe Connect (owner payouts)",
    summary: "Paying owners what a statement says they are owed, with the four-eyes step.",
    status: "built",
    href: "/owners/payouts",
    port: "PayoutProvider",
    spec: "17 §17.4",
    configurable: true,
  },
  {
    key: "stripe_billing",
    name: "Stripe Billing (your subscription)",
    summary: "Your own plan, metered on peak active units. Hosted mode only; self-hosting is free.",
    status: "built",
    href: "/settings/billing",
    port: "BillingProvider",
    spec: "12 §12.5",
    configurable: true,
  },
  {
    key: "mail",
    name: "Email (SMTP or Resend)",
    summary: "Confirmations, statements, scheduled reports and the guest's portal link.",
    status: "built",
    port: "Mailer",
    spec: "04 §4.8",
    configurable: true,
  },
  {
    key: "pricing",
    name: "Pricing engines (PriceLabs, Wheelhouse)",
    summary:
      "Prices computed elsewhere, through guard rails and a dry run. A CSV export works today; a scheduled pull needs an adapter.",
    status: "partial",
    href: "/properties",
    port: "RateImportProvider",
    spec: "06 §6.5b",
  },
  {
    key: "locks",
    name: "Smart locks (Nuki, TTLock, Igloomome)",
    summary:
      "Door codes issued and revoked per stay. The built-in provider issues codes you set by hand; a lock vendor is a plugin.",
    status: "port",
    href: "/operations",
    port: "LockProvider",
    spec: "08 §8.4",
  },
  {
    key: "llm",
    name: "Reply drafting (a model of your choice)",
    summary:
      "Optional and off by default. The guest guide drafts replies without any model; point this at a local one if you want more.",
    status: "port",
    href: "/inbox",
    port: "LlmProvider",
    spec: "09 §9.3",
    configurable: true,
  },
  {
    key: "plugins",
    name: "Your own code (outbound webhooks)",
    summary:
      "Signed, retried deliveries of the events you choose, so anything you run can react to a booking.",
    status: "built",
    href: "/settings/plugins",
    spec: "12 §12.6",
  },
  {
    key: "guest_registration",
    name: "Guest registration (Alloggiati, SES, AIMA)",
    summary: "Filing guest details where the law requires it, per country.",
    status: "planned",
    spec: "13 §13.9",
  },
  {
    key: "accounting",
    name: "Accounting exports",
    summary: "Handing the ledger to the software your accountant already uses.",
    status: "planned",
    spec: "15",
  },
];

/** Grouped for the page: what works, what needs your code, what is coming. */
export function integrationsByStatus(): Record<IntegrationStatus, readonly IntegrationEntry[]> {
  const out: Record<IntegrationStatus, IntegrationEntry[]> = {
    built: [],
    partial: [],
    port: [],
    planned: [],
  };
  for (const i of INTEGRATIONS) out[i.status].push(i);
  return out;
}
