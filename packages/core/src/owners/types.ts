/** Spec 17 §17.1: the commercial terms of one agreement version. Money is integer minor units; rates are basis points. */
export type AgreementModel =
  | { kind: "commission_pct"; rateBps: number }
  | { kind: "fixed_fee"; amountMinor: number }
  | { kind: "tiered"; tiers: Array<{ uptoMinor: number | null; rateBps: number }> }
  | { kind: "guaranteed_rent"; amountMinor: number };

/** The field every dispute is about; printed on every statement. */
export type CommissionBasis = "gross" | "net_of_ota_commission" | "net_of_tax";

export type ExpenseCategory = "cleaning" | "consumables" | "maintenance" | "linen" | "other";
export type DeductibleRule =
  { kind: "at_cost" } | { kind: "marked_up"; markupBps: number } | { kind: "absorbed" };
export type CleaningFeeRule =
  { kind: "kept" } | { kind: "passed" } | { kind: "split"; ownerBps: number };
export type OwnerStayRule =
  | { kind: "free" }
  | { kind: "at_cost"; nightlyMinor: number }
  | { kind: "rate"; nightlyMinor: number };

export interface PayoutTerms {
  frequency: "monthly" | "fortnightly";
  dayOfMonth: number;
  minimumMinor: number;
  holdBackBps: number;
}

export interface AgreementTerms {
  id: string;
  version: number;
  ownerId: string;
  propertyId: string;
  /** null = the whole property. */
  unitIds: string[] | null;
  model: AgreementModel;
  commissionBasis: CommissionBasis;
  deductibles: Partial<Record<ExpenseCategory, DeductibleRule>>;
  cleaningFees: CleaningFeeRule;
  ownerStays: OwnerStayRule;
  /** Free owner-stay nights per calendar year; null = unlimited under the rule. */
  ownerStayAllowanceNights: number | null;
  payout: PayoutTerms;
  vat: { onFee: boolean; rateBps: number };
  currency: string;
  effectiveFrom: string;
  /** Exclusive; null = open-ended. */
  effectiveTo: string | null;
}

/** One booking night inside the period (STMT-3): the unit of revenue attribution. */
export interface StatementNight {
  bookingId: string;
  /** Stable identity of the room-night within the booking across re-projections (the booking id when rooms are aggregated). */
  roomKey: string;
  date: string;
  unitId: string | null;
  amountMinor: number;
  /** The night's share of the booking's OTA commission, actual where reported. */
  otaCommissionMinor: number;
  otaCommissionKind: "actual" | "estimate" | "none";
  withheldTaxMinor: number;
  /** The booking's cleaning fee, attached to its first night in the period. */
  cleaningFeeMinor: number;
  channel: string;
  guestLabel: string;
  arrivalDate: string;
  departureDate: string;
}

export interface StatementExpense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amountMinor: number;
  vendor: string | null;
  hasReceipt: boolean;
}

export interface OwnerStayNight {
  blockId: string;
  date: string;
  unitId: string | null;
}

export interface StatementAdjustment {
  id: string;
  kind: "restatement" | "manual" | "dispute";
  date: string;
  description: string;
  amountMinor: number;
  originStatementId: string | null;
  originBookingId: string | null;
}

export interface StatementInput {
  period: { from: string; to: string };
  currency: string;
  /** Every agreement version that touches the period, in effective order (AGR-1). */
  segments: AgreementTerms[];
  nights: StatementNight[];
  expenses: StatementExpense[];
  ownerStays: OwnerStayNight[];
  adjustments: StatementAdjustment[];
  /** Hold-back retained on the previous statement, released now (PAY-3). */
  holdBackReleasedMinor: number;
  /** Owner-stay nights already used this calendar year before the period. */
  ownerStayNightsUsedBefore: number;
}

export type StatementLineKind =
  | "booking_revenue"
  | "ota_commission"
  | "withheld_tax"
  | "cleaning"
  | "management_fee"
  | "fee_vat"
  | "expense"
  | "expense_markup"
  | "owner_stay"
  | "adjustment"
  | "hold_back";

export interface StatementLine {
  kind: StatementLineKind;
  date: string;
  description: string;
  /** Owner's perspective: revenue positive, deductions negative. */
  amountMinor: number;
  agreementVersion: number;
  bookingId: string | null;
  expenseId: string | null;
  blockId: string | null;
  adjustmentId: string | null;
  /** Provenance for STMT-1: what the line was computed from. */
  basis: Record<string, string | number | boolean | null>;
}

export interface StatementSegmentSummary {
  version: number;
  from: string;
  to: string;
  commissionBasis: CommissionBasis;
  model: AgreementModel;
  nights: number;
}

export interface StatementTotals {
  grossRevenue: number;
  otaCommission: number;
  withheldTax: number;
  revenueBasis: number;
  managementFee: number;
  feeVat: number;
  cleaning: number;
  expenses: number;
  ownerStays: number;
  adjustments: number;
  holdBackRetained: number;
  holdBackReleased: number;
  /** Sum of every line: what the owner is owed for the period. */
  netDue: number;
  /** What is paid now: net due, or zero when below the agreement's minimum (carried forward). */
  payable: number;
  carriedForward: number;
  estimatedCommissionNights: number;
}

export interface StatementResult {
  currency: string;
  period: { from: string; to: string };
  segments: StatementSegmentSummary[];
  lines: StatementLine[];
  totals: StatementTotals;
  warnings: string[];
}
