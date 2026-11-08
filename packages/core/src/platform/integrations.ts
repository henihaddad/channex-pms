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

/** Where a connection sits on the page (design board "Settings — Integrations"). */
export type IntegrationGroup = "distribution" | "money" | "guest_ops";
export const INTEGRATION_GROUPS: readonly IntegrationGroup[] = [
  "distribution",
  "money",
  "guest_ops",
];

export interface IntegrationEntry {
  key: string;
  group: IntegrationGroup;
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
    group: "distribution",
    name: "Channex",
    summary:
      "Every channel: availability and rates out, bookings, messages and reviews in. The one connection the product is built on.",
    status: "built",
    href: "/channels",
    port: "ConnectivityProvider",
    spec: "05",
  },
  {
    key: "booking_engine",
    group: "distribution",
    name: "Booking site",
    summary:
      "Your own commission-free booking pages, one per property, with the same availability and rates every channel gets.",
    status: "built",
    href: "/booking-engine",
    spec: "10",
  },
  {
    key: "ical",
    group: "distribution",
    name: "iCal feeds",
    summary:
      "A calendar feed per unit for tools that only read iCal. Channex carries every channel that matters, so this waits.",
    status: "planned",
    spec: "15",
  },
  {
    key: "stripe_payments",
    group: "money",
    name: "Stripe (guest payments)",
    summary: "Cards for direct bookings, deposits and instalments, with refunds on cancellation.",
    status: "built",
    href: "/financials/payment-rules",
    port: "PaymentProvider",
    spec: "10 §10.4",
    configurable: true,
  },
  {
    key: "stripe_connect",
    group: "money",
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
    group: "money",
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
    group: "guest_ops",
    name: "Email (SMTP or Resend)",
    summary: "Confirmations, statements, scheduled reports and the guest's portal link.",
    status: "built",
    port: "Mailer",
    spec: "04 §4.8",
    configurable: true,
  },
  {
    key: "pricing",
    group: "money",
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
    group: "guest_ops",
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
    group: "guest_ops",
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
    group: "guest_ops",
    name: "Your own code (outbound webhooks)",
    summary:
      "Signed, retried deliveries of the events you choose, so anything you run can react to a booking.",
    status: "built",
    href: "/settings/plugins",
    spec: "12 §12.6",
  },
  {
    key: "whatsapp",
    group: "guest_ops",
    name: "WhatsApp",
    summary: "Guest messaging on your own business number, in the same inbox as the channels.",
    status: "planned",
    spec: "09",
  },
  {
    key: "home_assistant",
    group: "guest_ops",
    name: "Home Assistant",
    summary:
      "Arrival and departure events for your own automations. Outbound webhooks carry the same events today.",
    status: "planned",
    spec: "12 §12.7",
  },
  {
    key: "guest_registration",
    group: "guest_ops",
    name: "Guest registration (Alloggiati, SES, AIMA)",
    summary: "Filing guest details where the law requires it, per country.",
    status: "planned",
    spec: "13 §13.9",
  },
  {
    key: "accounting",
    group: "money",
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

/** Grouped for the page, in the registry's own order within each group. */
export function integrationsByGroup(): Record<IntegrationGroup, readonly IntegrationEntry[]> {
  const out: Record<IntegrationGroup, IntegrationEntry[]> = {
    distribution: [],
    money: [],
    guest_ops: [],
  };
  for (const i of INTEGRATIONS) out[i.group].push(i);
  return out;
}

/** What a manager sees on the card: running here, ready to set up, or not built yet. */
export type IntegrationState = "connected" | "available" | "planned";

/**
 * The card's state. `planned` is planned whatever is configured; a built connection that
 * needs no key, or has its key, and is in use by this organisation is `connected`;
 * everything else can be set up and is `available`.
 */
export function integrationState(
  entry: Pick<IntegrationEntry, "status" | "configurable">,
  here: { configured?: boolean; inUse?: boolean },
): IntegrationState {
  if (entry.status === "planned") return "planned";
  const keyed = !entry.configurable || here.configured === true;
  const used = here.inUse ?? true;
  return keyed && used && entry.status !== "port" ? "connected" : "available";
}
