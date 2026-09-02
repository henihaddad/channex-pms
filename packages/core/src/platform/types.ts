/** Spec 12 §12.5: per active unit per month with volume tiers; add-ons; annual discount. */
export interface PlanTier {
  /** First unit of the tier (1-based, inclusive). */
  fromUnits: number;
  /** Price per unit per month in minor units of the plan currency. */
  unitMinor: number;
}

export interface Plan {
  id: string;
  key: string;
  name: string;
  currency: string;
  tiers: PlanTier[];
  /** Included in every plan: the booking engine and the owner portal (§12.5); add-ons are extra lines. */
  addOns: Array<{ key: string; name: string; monthlyMinor: number }>;
  annualDiscountBps: number;
  quotas: Quotas;
  trialDays: number;
}

/** Spec 12 §12.4: plan limits. `null` means unlimited. */
export interface Quotas {
  properties: number | null;
  rooms: number | null;
  users: number | null;
  apiRequestsPerMinute: number | null;
  webhookEndpoints: number | null;
  retentionDays: number | null;
  storageMb: number | null;
}

export type TenantState = "trial" | "active" | "past_due" | "suspended" | "expired" | "offboarding";

export type TenantEvent =
  | "plan_chosen"
  | "trial_ended"
  | "payment_failed"
  | "payment_recovered"
  | "dunning_exhausted"
  | "reactivated"
  | "offboarding_requested"
  | "retention_expired"
  | "purged";

/** Nightly metering row (§12.5): active units on that day, billed on the period peak. */
export interface UsageRecord {
  orgId: string;
  date: string;
  activeUnits: number;
  properties: number;
  users: number;
}

export interface BillingPeriod {
  from: string;
  /** Exclusive. */
  to: string;
}

export interface InvoiceLine {
  key: string;
  description: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
}

/** BILL-2: every charge explainable from usage the customer can see. */
export interface InvoiceDraft {
  currency: string;
  period: BillingPeriod;
  peakUnits: number;
  lines: InvoiceLine[];
  subtotalMinor: number;
  vat: VatResult;
  totalMinor: number;
}

export interface VatResult {
  /** Basis points applied. */
  rateBps: number;
  amountMinor: number;
  /** EU B2B reverse charge, no VAT charged, note printed on the invoice. */
  reverseCharge: boolean;
  note: string;
}

export interface CustomerTax {
  country: string;
  /** Validated VAT id, when the customer is a business. */
  vatId: string | null;
}

/** Work kinds a quota may throttle (§12.4). Connectivity is exempt by construction (QUOTA-1). */
export type WorkKind =
  | "ari.push"
  | "booking.ingest"
  | "booking.ack"
  | "webhook.ingest"
  | "reconcile"
  | "report"
  | "export"
  | "bulk"
  | "message.send"
  | "api.read"
  | "api.write";

export interface UsageSnapshot {
  properties: number;
  rooms: number;
  users: number;
  apiRequestsLastMinute: number;
  webhookEndpoints: number;
  storageMb: number;
}
