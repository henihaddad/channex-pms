import { LocalDate } from "../shared/local-date.js";
import { Money } from "../shared/money.js";

/**
 * When an instalment falls due (spec 10 §10.4). `confirmation` is charged as soon
 * as the booking is confirmed; the other two are relative to the stay, so a
 * booking made after the moment has passed is due immediately.
 */
export type PaymentTrigger = "confirmation" | "before_arrival" | "after_arrival";

/** How much this rule takes: a share of the stay's total, or a fixed amount. */
export type PaymentAmount =
  | { kind: "percent"; percentBps: number }
  | { kind: "fixed"; amountMinor: number }
  | { kind: "remainder" };

export interface PaymentRule {
  id: string;
  name: string;
  trigger: PaymentTrigger;
  /** Days before arrival, or after it, depending on the trigger. Ignored for `confirmation`. */
  offsetDays: number;
  amount: PaymentAmount;
  /** Empty means every property. */
  propertyIds: string[];
  /** Empty means every channel; codes as stored on the connection ("direct", "AirBNB", …). */
  channels: string[];
  enabled: boolean;
  /** Rules apply in this order; the remainder rule should come last. */
  position: number;
}

export interface PaymentPlanInput {
  rules: readonly PaymentRule[];
  totalMinor: number;
  currency: string;
  propertyId: string;
  channel: string;
  /** First night of the stay. */
  arrival: string;
  /** The day the booking was confirmed. */
  bookedOn: string;
}

export interface Instalment {
  ruleId: string;
  name: string;
  dueOn: string;
  amountMinor: number;
}

const applies = (r: PaymentRule, propertyId: string, channel: string) =>
  r.enabled &&
  (r.propertyIds.length === 0 || r.propertyIds.includes(propertyId)) &&
  (r.channels.length === 0 || r.channels.includes(channel));

const dueDate = (r: PaymentRule, input: PaymentPlanInput): string => {
  if (r.trigger === "confirmation") return input.bookedOn;
  const arrival = LocalDate.parse(input.arrival);
  const when =
    r.trigger === "before_arrival"
      ? arrival.minusDays(Math.max(0, r.offsetDays))
      : arrival.plusDays(Math.max(0, r.offsetDays));
  // a rule whose moment has already passed is due now, never in the past
  return when.isBefore(LocalDate.parse(input.bookedOn)) ? input.bookedOn : when.toString();
};

/**
 * The instalments a booking owes, in due order (spec 10 §10.4). Percentages are
 * taken of the stay's total and never overshoot it: each rule is capped by what
 * is still unallocated, and a `remainder` rule takes exactly what is left, so the
 * instalments always sum to the total when one exists and never exceed it
 * otherwise. Zero-amount instalments are dropped.
 */
export function planPayments(input: PaymentPlanInput): Instalment[] {
  const total = Math.max(0, input.totalMinor);
  const rules = [...input.rules]
    .filter((r) => applies(r, input.propertyId, input.channel))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const out: Instalment[] = [];
  let left = total;
  for (const r of rules) {
    if (left <= 0) break;
    const wanted =
      r.amount.kind === "fixed"
        ? r.amount.amountMinor
        : r.amount.kind === "percent"
          ? Money.of(total, input.currency).allocate([
              r.amount.percentBps,
              Math.max(0, 10_000 - r.amount.percentBps),
            ])[0]!.minor
          : left;
    const amountMinor = Math.max(0, Math.min(wanted, left));
    if (amountMinor === 0) continue;
    left -= amountMinor;
    out.push({ ruleId: r.id, name: r.name, dueOn: dueDate(r, input), amountMinor });
  }
  return out.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

/** What a plan leaves uncollected: zero when the rules cover the stay. */
export function uncoveredMinor(input: PaymentPlanInput): number {
  const planned = planPayments(input).reduce((n, i) => n + i.amountMinor, 0);
  return Math.max(0, Math.max(0, input.totalMinor) - planned);
}

/** The catalogue a new organisation starts with: everything at confirmation. */
export function defaultPaymentRules(idOf: (n: number) => string): PaymentRule[] {
  return [
    {
      id: idOf(0),
      name: "Collect 100% at booking confirmation",
      trigger: "confirmation",
      offsetDays: 0,
      amount: { kind: "remainder" },
      propertyIds: [],
      channels: ["direct"],
      enabled: true,
      position: 0,
    },
  ];
}
