import type {
  BillingPeriod,
  CustomerTax,
  InvoiceDraft,
  InvoiceLine,
  Plan,
  UsageRecord,
  VatResult,
} from "./types.js";

/** The launch catalogue (§12.5). Numbers are the defaults; the operator edits them in the `plan` table. */
export const LAUNCH_PLANS: Plan[] = [
  {
    id: "plan_starter",
    key: "starter",
    name: "Starter",
    currency: "EUR",
    tiers: [{ fromUnits: 1, unitMinor: 900 }],
    addOns: [{ key: "priority_support", name: "Priority support", monthlyMinor: 4900 }],
    annualDiscountBps: 1500,
    quotas: {
      properties: 10,
      rooms: 25,
      users: 5,
      apiRequestsPerMinute: 120,
      webhookEndpoints: 2,
      retentionDays: 400,
      storageMb: 2048,
    },
    trialDays: 14,
  },
  {
    id: "plan_growth",
    key: "growth",
    name: "Growth",
    currency: "EUR",
    tiers: [
      { fromUnits: 1, unitMinor: 800 },
      { fromUnits: 51, unitMinor: 650 },
      { fromUnits: 201, unitMinor: 500 },
    ],
    addOns: [{ key: "priority_support", name: "Priority support", monthlyMinor: 9900 }],
    annualDiscountBps: 1500,
    quotas: {
      properties: 300,
      rooms: 1000,
      users: 50,
      apiRequestsPerMinute: 600,
      webhookEndpoints: 10,
      retentionDays: 1100,
      storageMb: 20480,
    },
    trialDays: 14,
  },
  {
    id: "plan_scale",
    key: "scale",
    name: "Scale",
    currency: "EUR",
    tiers: [
      { fromUnits: 1, unitMinor: 700 },
      { fromUnits: 201, unitMinor: 450 },
      { fromUnits: 1001, unitMinor: 300 },
    ],
    addOns: [{ key: "priority_support", name: "Priority support", monthlyMinor: 0 }],
    annualDiscountBps: 2000,
    quotas: {
      properties: null,
      rooms: null,
      users: null,
      apiRequestsPerMinute: 3000,
      webhookEndpoints: 50,
      retentionDays: null,
      storageMb: null,
    },
    trialDays: 14,
  },
];

/** Peak active units inside the period: portfolios grow, and the peak is what the customer had (§12.5). */
export function peakUnits(records: readonly UsageRecord[], period: BillingPeriod): number {
  let peak = 0;
  for (const r of records)
    if (r.date >= period.from && r.date < period.to && r.activeUnits > peak) peak = r.activeUnits;
  return peak;
}

/** Volume tiers are marginal: units 1–50 at the first price, 51–200 at the second, and so on. */
export function tieredAmount(
  plan: Plan,
  units: number,
): { lines: InvoiceLine[]; amountMinor: number } {
  const tiers = [...plan.tiers].sort((a, b) => a.fromUnits - b.fromUnits);
  const lines: InvoiceLine[] = [];
  let total = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    const next = tiers[i + 1];
    const upTo = next ? next.fromUnits - 1 : Number.POSITIVE_INFINITY;
    const inTier = Math.max(0, Math.min(units, upTo) - t.fromUnits + 1);
    if (inTier <= 0) continue;
    const amount = inTier * t.unitMinor;
    total += amount;
    lines.push({
      key: `units:${String(t.fromUnits)}`,
      description: `Active units ${String(t.fromUnits)}–${next ? String(upTo) : "∞"}`,
      quantity: inTier,
      unitMinor: t.unitMinor,
      amountMinor: amount,
    });
  }
  return { lines, amountMinor: total };
}

const EU = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);
/** Standard VAT rates for the seller's EU member states; the operator's own country carries the domestic rate. */
export const VAT_RATES_BPS: Readonly<Record<string, number>> = {
  AT: 2000,
  BE: 2100,
  BG: 2000,
  HR: 2500,
  CY: 1900,
  CZ: 2100,
  DK: 2500,
  EE: 2200,
  FI: 2550,
  FR: 2000,
  DE: 1900,
  GR: 2400,
  HU: 2700,
  IE: 2300,
  IT: 2200,
  LV: 2100,
  LT: 2100,
  LU: 1700,
  MT: 1800,
  NL: 2100,
  PL: 2300,
  PT: 2300,
  RO: 1900,
  SK: 2000,
  SI: 2200,
  ES: 2100,
  SE: 2500,
};

/**
 * VAT for a SaaS subscription sold from `sellerCountry` (§12.5): domestic customers pay the
 * seller's rate; EU businesses with a VAT id reverse-charge; EU consumers pay their own
 * country's rate (OSS); everyone outside the EU is out of scope.
 */
export function vatFor(
  sellerCountry: string,
  customer: CustomerTax,
  subtotalMinor: number,
): VatResult {
  const seller = sellerCountry.toUpperCase();
  const country = customer.country.toUpperCase();
  const apply = (rateBps: number, note: string): VatResult => ({
    rateBps,
    amountMinor: Math.round((subtotalMinor * rateBps) / 10_000),
    reverseCharge: false,
    note,
  });
  if (country === seller)
    return apply(
      VAT_RATES_BPS[seller] ?? 0,
      `VAT ${String((VAT_RATES_BPS[seller] ?? 0) / 100)} % (${seller})`,
    );
  if (EU.has(country)) {
    if (customer.vatId)
      return {
        rateBps: 0,
        amountMinor: 0,
        reverseCharge: true,
        note: "Reverse charge, Article 196 Council Directive 2006/112/EC",
      };
    return apply(
      VAT_RATES_BPS[country] ?? 0,
      `VAT ${String((VAT_RATES_BPS[country] ?? 0) / 100)} % (${country}, OSS)`,
    );
  }
  return { rateBps: 0, amountMinor: 0, reverseCharge: false, note: "Outside the scope of EU VAT" };
}

/** One invoice per period from usage the customer can see (BILL-2). Annual terms take the discount off the units. */
export function draftInvoice(input: {
  plan: Plan;
  records: readonly UsageRecord[];
  period: BillingPeriod;
  addOns: readonly string[];
  annual: boolean;
  sellerCountry: string;
  customer: CustomerTax;
}): InvoiceDraft {
  const peak = peakUnits(input.records, input.period);
  const units = tieredAmount(input.plan, peak);
  const lines: InvoiceLine[] = [...units.lines];
  if (input.annual && units.amountMinor > 0) {
    const discount = Math.round((units.amountMinor * input.plan.annualDiscountBps) / 10_000);
    lines.push({
      key: "annual_discount",
      description: `Annual commitment −${String(input.plan.annualDiscountBps / 100)} %`,
      quantity: 1,
      unitMinor: -discount,
      amountMinor: -discount,
    });
  }
  for (const key of input.addOns) {
    const a = input.plan.addOns.find((x) => x.key === key);
    if (a && a.monthlyMinor > 0)
      lines.push({
        key: `addon:${key}`,
        description: a.name,
        quantity: 1,
        unitMinor: a.monthlyMinor,
        amountMinor: a.monthlyMinor,
      });
  }
  const subtotal = lines.reduce((s, l) => s + l.amountMinor, 0);
  const vat = vatFor(input.sellerCountry, input.customer, subtotal);
  return {
    currency: input.plan.currency,
    period: input.period,
    peakUnits: peak,
    lines,
    subtotalMinor: subtotal,
    vat,
    totalMinor: subtotal + vat.amountMinor,
  };
}

/** Plan changes prorate by the days left in the period (§12.5 self-service). */
export function prorate(monthlyMinor: number, period: BillingPeriod, changeDate: string): number {
  const days = daysBetween(period.from, period.to);
  const left = Math.max(0, daysBetween(changeDate, period.to));
  return Math.round((monthlyMinor * left) / Math.max(1, days));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
