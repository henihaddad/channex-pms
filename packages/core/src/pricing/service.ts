import { LocalDate } from "../shared/local-date.js";
import type { RestrictionValues } from "../inventory/ari.js";
import type {
  RateImportInput,
  RateImportPlan,
  RateImportProvider,
  RateImportRow,
  RefusedRow,
} from "./types.js";

const HOLD_HOURS = 48;

const cellKey = (ratePlanId: string, date: string): string => `${ratePlanId}|${date}`;

/** Only the fields that changed, so the push carries exactly the delta. */
function diff(before: RestrictionValues, after: RestrictionValues): RestrictionValues {
  const out: RestrictionValues = {};
  for (const k of Object.keys(after) as (keyof RestrictionValues)[])
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
      (out as Record<string, unknown>)[k] = after[k];
  return out;
}

/** The previous value of every changed field; applying it is the undo. */
function inverse(before: RestrictionValues, after: RestrictionValues): RestrictionValues {
  const out: RestrictionValues = {};
  for (const k of new Set([...Object.keys(after), ...Object.keys(before)]) as Set<
    keyof RestrictionValues
  >)
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k]) && before[k] !== undefined)
      (out as Record<string, unknown>)[k] = before[k];
  return out;
}

/**
 * Dry run an import (spec 06 §6.5b): what each recommendation would do, what the guard
 * rails refuse and why, and the inverse that undoes the lot.
 *
 * Nothing is clamped. A price outside the floor or ceiling, or a move larger than the
 * configured maximum, is refused with a reason (YR-2) — a manager reads the list and
 * decides, rather than discovering later that an engine's bad day was quietly flattened
 * into something plausible.
 */
export function planRateImport(
  input: RateImportInput,
  current: ReadonlyMap<string, RestrictionValues>,
): RateImportPlan {
  const plan: RateImportPlan = {
    changes: [],
    inverse: [],
    cellCount: 0,
    refused: [],
    unmapped: [],
    held: [],
    outsideHorizon: [],
    samples: [],
    warnings: [],
  };
  const refused: RefusedRow[] = [];
  const unmapped: RateImportRow[] = [];
  const held: RateImportRow[] = [];
  const outside: RateImportRow[] = [];
  const rails = input.guardRails ?? {};
  const holdMs = (input.holdHours ?? HOLD_HOURS) * 3_600_000;
  const now = Date.parse(input.nowIso);
  const today = input.nowIso.slice(0, 10);

  for (const row of input.rows) {
    const ratePlanId = input.mapping.get(row.listingRef);
    if (!ratePlanId) {
      unmapped.push(row);
      continue;
    }
    if (row.date > input.horizonEnd || row.date < today) {
      outside.push(row);
      continue;
    }
    const before = current.get(cellKey(ratePlanId, row.date)) ?? {};

    // YR-5: a human edited this cell recently, so automation does not fight them. A
    // timestamp in the future (clock skew) holds the cell too: erring toward the human is
    // the only safe direction here.
    const editedAt = input.manualEditedAt?.get(cellKey(ratePlanId, row.date));
    if (editedAt && now - Date.parse(editedAt) < holdMs) {
      held.push(row);
      continue;
    }

    // YR-2: absolute guard rails, refused with a reason rather than clamped
    const reason = railBreach(row.priceMinor, before.rate, rails);
    if (reason && !input.override) {
      refused.push({ row, reason });
      continue;
    }
    if (reason) plan.warnings.push(`guard rail overridden: ${reason} on ${row.date}`);

    const after: RestrictionValues = { ...before, rate: row.priceMinor };
    if (row.minStay !== undefined && row.minStay !== null) after.minStay = row.minStay;
    const delta = diff(before, after);
    if (Object.keys(delta).length === 0) continue;
    plan.changes.push({ ratePlanId, date: row.date, values: delta });
    plan.inverse.push({ ratePlanId, date: row.date, values: inverse(before, after) });
    plan.cellCount += 1;
    if (plan.samples.length < 5) plan.samples.push({ ratePlanId, date: row.date, before, after });
  }

  plan.refused = refused;
  plan.unmapped = unmapped;
  plan.held = held;
  plan.outsideHorizon = outside;
  if (unmapped.length > 0)
    plan.warnings.push(
      `${String(new Set(unmapped.map((r) => r.listingRef)).size)} listing(s) the engine prices are not mapped here`,
    );
  if (held.length > 0)
    plan.warnings.push(
      `${String(held.length)} night(s) left alone: edited by hand inside the ${String(input.holdHours ?? HOLD_HOURS)} h hold`,
    );
  return plan;
}

/** Which rail a price breaks, or `null` when it is inside all of them. */
export function railBreach(
  priceMinor: number,
  currentMinor: number | undefined,
  rails: RateImportInput["guardRails"] = {},
): string | null {
  if (priceMinor < 0) return "a negative price";
  if (rails.floorMinor != null && priceMinor < rails.floorMinor)
    return `below the floor (${String(priceMinor)} < ${String(rails.floorMinor)})`;
  if (rails.ceilingMinor != null && priceMinor > rails.ceilingMinor)
    return `above the ceiling (${String(priceMinor)} > ${String(rails.ceilingMinor)})`;
  if (rails.maxChangeBps != null && currentMinor !== undefined && currentMinor > 0) {
    const moveBps = Math.round((Math.abs(priceMinor - currentMinor) * 10_000) / currentMinor);
    if (moveBps > rails.maxChangeBps)
      return `a ${String(Math.round(moveBps / 100))} % move, over the ${String(Math.round(rails.maxChangeBps / 100))} % limit`;
  }
  return null;
}

/**
 * Pull a window from a configured engine and plan it. The window is clamped to the seeded
 * horizon so an engine that offers three years of prices does not ask us to write cells
 * that do not exist.
 */
export async function importRates(
  provider: RateImportProvider,
  args: {
    propertyRef: string;
    from: string;
    to: string;
  } & Omit<RateImportInput, "rows">,
  current: ReadonlyMap<string, RestrictionValues>,
): Promise<RateImportPlan & { provider: string; fetched: number }> {
  const to = args.to > args.horizonEnd ? args.horizonEnd : args.to;
  const rows = LocalDate.parse(args.from).isAfter(LocalDate.parse(to))
    ? []
    : await provider.fetchRates({ propertyRef: args.propertyRef, from: args.from, to });
  const plan = planRateImport({ ...args, rows }, current);
  return { ...plan, provider: provider.name, fetched: rows.length };
}
