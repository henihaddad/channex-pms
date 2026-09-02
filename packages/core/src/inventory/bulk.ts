import { LocalDate } from "../shared/local-date.js";
import type { RateCell, RestrictionValues, Weekday } from "./ari.js";
import { WEEKDAYS } from "./ari.js";

/** One bulk-update operation (spec 06 §6.3). Amounts in minor units; percent in basis points. */
export type BulkOp =
  | { op: "set_rate"; rateMinor: number }
  | {
      op: "adjust_rate_percent";
      basisPoints: number;
      rounding?: "nearest" | "up" | "down";
      roundToMinor?: number;
    }
  | { op: "adjust_rate_amount"; deltaMinor: number }
  | { op: "set_min_stay"; minStay: number | null }
  | { op: "set_max_stay"; maxStay: number | null }
  | { op: "set_cta"; closed: boolean }
  | { op: "set_ctd"; closed: boolean }
  | { op: "stop_sell"; stop: boolean };

export interface BulkInput {
  dateFrom: string;
  dateTo: string;
  days?: Weekday[];
  ratePlanIds: string[];
  ops: BulkOp[];
  /** Furthest date cells may be written (the seeded horizon end). */
  horizonEnd: string;
  /** Explicit override of guard rails, recorded in the audit log (BULK-4). */
  override?: boolean;
}

export interface BulkPlan {
  changes: RateCell[];
  /** Previous values for every changed cell: applying them is the undo (BULK-2). */
  inverse: RateCell[];
  cellCount: number;
  samples: Array<{
    ratePlanId: string;
    date: string;
    before: RestrictionValues;
    after: RestrictionValues;
  }>;
  warnings: string[];
  blocked: string[];
}

export const BLAST_RADIUS_WARN = 400;

/**
 * Dry run (BULK-1): compute every change and its inverse from the current
 * cells without touching anything. Guard rails (BULK-4) block obviously wrong
 * input unless explicitly overridden.
 */
export function planBulkUpdate(
  input: BulkInput,
  current: ReadonlyMap<string, RestrictionValues>,
  medianRateMinor?: number,
): BulkPlan {
  const plan: BulkPlan = {
    changes: [],
    inverse: [],
    cellCount: 0,
    samples: [],
    warnings: [],
    blocked: [],
  };
  if (input.dateTo < input.dateFrom) plan.blocked.push("date range is inverted");
  if (input.dateTo > input.horizonEnd)
    plan.blocked.push(`range ends after the seeded horizon (${input.horizonEnd})`);
  for (const op of input.ops) {
    if (op.op === "set_rate" && op.rateMinor < 0) plan.blocked.push("negative rate");
    if (
      op.op === "set_rate" &&
      medianRateMinor &&
      medianRateMinor > 0 &&
      op.rateMinor > medianRateMinor * 100
    )
      plan.blocked.push("rate is more than 100× the 90-day median");
    if (op.op === "set_min_stay" && op.minStay !== null && op.minStay < 1)
      plan.blocked.push("min stay below 1");
  }
  if (plan.blocked.length && !input.override) return plan;
  if (plan.blocked.length && input.override)
    plan.warnings.push(`guard rails overridden: ${plan.blocked.join("; ")}`);
  const dayFilter = input.days ? new Set(input.days) : null;
  for (const ratePlanId of input.ratePlanIds) {
    for (
      let d = LocalDate.parse(input.dateFrom);
      !d.isAfter(LocalDate.parse(input.dateTo));
      d = d.plusDays(1)
    ) {
      if (dayFilter && !dayFilter.has(WEEKDAYS[d.dayOfWeek - 1]!)) continue;
      const date = d.toString();
      const before = current.get(`${ratePlanId}|${date}`) ?? {};
      const after = applyOps(before, input.ops);
      if (JSON.stringify(after) === JSON.stringify(before)) continue;
      plan.changes.push({ ratePlanId, date, values: diffValues(before, after) });
      plan.inverse.push({ ratePlanId, date, values: inverseValues(before, after) });
      plan.cellCount += 1;
      if (plan.samples.length < 5) plan.samples.push({ ratePlanId, date, before, after });
    }
  }
  if (plan.cellCount > BLAST_RADIUS_WARN)
    plan.warnings.push(
      `${String(plan.cellCount)} cells affected (blast radius above ${String(BLAST_RADIUS_WARN)})`,
    );
  return plan;
}

export function applyOps(values: RestrictionValues, ops: readonly BulkOp[]): RestrictionValues {
  const v: RestrictionValues = { ...values };
  for (const op of ops) {
    switch (op.op) {
      case "set_rate":
        v.rate = op.rateMinor;
        break;
      case "adjust_rate_percent":
        if (v.rate !== undefined)
          v.rate = roundTo(
            v.rate + (v.rate * op.basisPoints) / 10_000,
            op.rounding ?? "nearest",
            op.roundToMinor ?? 1,
          );
        break;
      case "adjust_rate_amount":
        if (v.rate !== undefined) v.rate = Math.max(0, v.rate + op.deltaMinor);
        break;
      case "set_min_stay":
        if (op.minStay === null) delete v.minStay;
        else v.minStay = op.minStay;
        break;
      case "set_max_stay":
        if (op.maxStay === null) delete v.maxStay;
        else v.maxStay = op.maxStay;
        break;
      case "set_cta":
        v.closedToArrival = op.closed;
        break;
      case "set_ctd":
        v.closedToDeparture = op.closed;
        break;
      case "stop_sell":
        v.stopSell = op.stop;
        break;
    }
  }
  return v;
}

function roundTo(x: number, mode: "nearest" | "up" | "down", step: number): number {
  const q = x / step;
  const r = mode === "up" ? Math.ceil(q) : mode === "down" ? Math.floor(q) : Math.round(q);
  return Math.max(0, r * step);
}

/** Only the fields that changed, so the push carries exactly the delta. */
function diffValues(before: RestrictionValues, after: RestrictionValues): RestrictionValues {
  const out: RestrictionValues = {};
  for (const k of Object.keys(after) as (keyof RestrictionValues)[])
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
      (out as Record<string, unknown>)[k] = after[k];
  return out;
}

/** The previous value of every changed field (a cleared field cannot be expressed on the wire; it restores to the previous value). */
function inverseValues(before: RestrictionValues, after: RestrictionValues): RestrictionValues {
  const out: RestrictionValues = {};
  for (const k of new Set([...Object.keys(after), ...Object.keys(before)]) as Set<
    keyof RestrictionValues
  >) {
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k]) && before[k] !== undefined)
      (out as Record<string, unknown>)[k] = before[k];
  }
  return out;
}
