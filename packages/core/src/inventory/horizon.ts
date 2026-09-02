import type { LocalDate } from "../shared/local-date.js";
import type { RateCell, RestrictionValues } from "./ari.js";

export const DEFAULT_HORIZON_DAYS = 730;

/** Seed a fresh rate plan's horizon with defaults (PROV-5). */
export function seedHorizon(
  ratePlanId: string,
  from: LocalDate,
  days: number,
  defaults: RestrictionValues,
): RateCell[] {
  const out: RateCell[] = [];
  for (let i = 0; i < days; i++)
    out.push({ ratePlanId, date: from.plusDays(i).toString(), values: { ...defaults } });
  return out;
}

/**
 * Rolling horizon (spec 06 §6.7): new dates inherit from the same weekday of
 * the prior year when present, otherwise from the configured default.
 */
export function extendHorizon(
  ratePlanId: string,
  lastSeeded: LocalDate,
  today: LocalDate,
  days: number,
  lookup: (date: string) => RestrictionValues | undefined,
  defaults: RestrictionValues,
): RateCell[] {
  const target = today.plusDays(days - 1);
  const out: RateCell[] = [];
  for (let d = lastSeeded.plusDays(1); !d.isAfter(target); d = d.plusDays(1)) {
    // 364 days back keeps the weekday
    const prior = lookup(d.minusDays(364).toString());
    out.push({ ratePlanId, date: d.toString(), values: prior ? { ...prior } : { ...defaults } });
  }
  return out;
}
