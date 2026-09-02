import type { Weekday } from "@pms/core";
import { weekdayOf } from "./dates.js";

/**
 * Encode one field's values over one contiguous span of dates into the fewest
 * (dateFrom, dateTo, days?) entries, exploiting FIFO overrides (spec 05 §5.4.3).
 * Values are compared by their canonical JSON so `rates` objects work too.
 *
 * Three encodings are tried and the cheapest wins:
 *   1. run-length: one entry per run of equal values
 *   2. weekday: one entry per distinct value, with the `days` filter, when every
 *      weekday holds a constant value across the span
 *   3. base + override: the dominant value over the whole span first, then runs
 *      for the exceptions (FIFO: later entries win)
 */
export interface FieldEntry<V> {
  dateFrom: string;
  dateTo: string;
  days?: Weekday[];
  value: V;
}

export function encodeSpan<V>(
  dates: readonly string[],
  valueAt: (date: string) => V,
  key: (v: V) => string,
): FieldEntry<V>[] {
  if (dates.length === 0) return [];
  const runs = runLength(dates, valueAt, key);
  let best = runs;
  const byWeekday = weekdayEncoding(dates, valueAt, key);
  if (byWeekday && byWeekday.length < best.length) best = byWeekday;
  const layered = baseAndOverride(dates, valueAt, key, runs);
  if (layered.length < best.length) best = layered;
  return best;
}

function runLength<V>(
  dates: readonly string[],
  valueAt: (d: string) => V,
  key: (v: V) => string,
): FieldEntry<V>[] {
  const out: FieldEntry<V>[] = [];
  for (const d of dates) {
    const v = valueAt(d);
    const last = out.at(-1);
    if (last && key(last.value) === key(v)) last.dateTo = d;
    else out.push({ dateFrom: d, dateTo: d, value: v });
  }
  return out;
}

function weekdayEncoding<V>(
  dates: readonly string[],
  valueAt: (d: string) => V,
  key: (v: V) => string,
): FieldEntry<V>[] | null {
  if (dates.length < 8) return null; // a week or less never benefits
  const perDay = new Map<Weekday, { k: string; v: V }>();
  for (const d of dates) {
    const wd = weekdayOf(d);
    const v = valueAt(d);
    const k = key(v);
    const seen = perDay.get(wd);
    if (seen && seen.k !== k) return null;
    if (!seen) perDay.set(wd, { k, v });
  }
  const groups = new Map<string, { v: V; days: Weekday[] }>();
  for (const [wd, { k, v }] of perDay) {
    const g = groups.get(k) ?? { v, days: [] };
    g.days.push(wd);
    groups.set(k, g);
  }
  const first = dates[0]!;
  const last = dates.at(-1)!;
  return [...groups.values()].map((g) => ({
    dateFrom: first,
    dateTo: last,
    days: g.days.sort(byWeekdayOrder),
    value: g.v,
  }));
}

function baseAndOverride<V>(
  dates: readonly string[],
  valueAt: (d: string) => V,
  key: (v: V) => string,
  runs: FieldEntry<V>[],
): FieldEntry<V>[] {
  const count = new Map<string, { v: V; n: number }>();
  for (const d of dates) {
    const v = valueAt(d);
    const k = key(v);
    const c = count.get(k) ?? { v, n: 0 };
    c.n += 1;
    count.set(k, c);
  }
  let dominant: { k: string; v: V; n: number } | null = null;
  for (const [k, c] of count) if (!dominant || c.n > dominant.n) dominant = { k, ...c };
  if (!dominant || count.size === 1) return runs;
  const overrides = runs.filter((r) => key(r.value) !== dominant.k);
  return [{ dateFrom: dates[0]!, dateTo: dates.at(-1)!, value: dominant.v }, ...overrides];
}

const ORDER: Record<Weekday, number> = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };
function byWeekdayOrder(a: Weekday, b: Weekday): number {
  return ORDER[a] - ORDER[b];
}
