import { LocalDate } from "../shared/local-date.js";

/**
 * Seasons (spec 06 §6.6): named night ranges that colour the calendar and act as bulk-edit
 * targets. A range is inclusive of both nights, as a manager says it ("15 Jun → 15 Sep").
 *
 * Persona: the `revenue_manager` and the owner-operator planning the year (spec 02).
 */
export interface SeasonRange {
  from: string;
  to: string;
}
export interface SeasonInput {
  name: string;
  ranges: SeasonRange[];
  colour?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const COLOUR = /^#[0-9a-f]{6}$/i;
const isNight = (iso: string): boolean => {
  if (!ISO.test(iso)) return false;
  try {
    return LocalDate.parse(iso).toString() === iso;
  } catch {
    return false;
  }
};

/** Problems with a season, in words a manager can act on; empty when it can be saved. */
export function validateSeason(s: SeasonInput): string[] {
  const out: string[] = [];
  if (s.name.trim().length === 0) out.push("Give the season a name.");
  if (s.name.length > 60) out.push("Keep the name under 60 characters.");
  if (s.ranges.length === 0) out.push("Add at least one range of nights.");
  if (s.colour !== undefined && !COLOUR.test(s.colour)) out.push("Pick a colour like #94a3b8.");
  const sorted = [...s.ranges].sort((a, b) => (a.from < b.from ? -1 : 1));
  for (const r of sorted) {
    if (!isNight(r.from) || !isNight(r.to)) {
      out.push("Dates must be real nights.");
      continue;
    }
    if (LocalDate.parse(r.to).isBefore(LocalDate.parse(r.from)))
      out.push(`${r.from} → ${r.to} ends before it starts.`);
    if (LocalDate.parse(r.from).daysUntil(LocalDate.parse(r.to)) > 366)
      out.push(`${r.from} → ${r.to} is longer than a year.`);
  }
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i]!.from <= sorted[i - 1]!.to)
      out.push(`${sorted[i - 1]!.from} → ${sorted[i - 1]!.to} overlaps ${sorted[i]!.from}.`);
  return out;
}

/** The first season whose ranges hold this night, if any. */
export function seasonOn<T extends { ranges: SeasonRange[] }>(
  date: string,
  seasons: readonly T[],
): T | undefined {
  return seasons.find((s) => s.ranges.some((r) => r.from <= date && date <= r.to));
}

/** How many nights a season covers inside [from, to]. */
export function seasonNights(ranges: readonly SeasonRange[], from: string, to: string): number {
  let n = 0;
  for (const r of ranges) {
    const a = r.from > from ? r.from : from;
    const b = r.to < to ? r.to : to;
    if (a <= b) n += LocalDate.parse(a).daysUntil(LocalDate.parse(b)) + 1;
  }
  return n;
}

/** One night of one listing, as the year view needs it. */
export interface YearNight {
  date: string;
  /** Units that could be sold that night (rooms minus blocks). */
  sellable: number;
  /** Units booked that night. */
  booked: number;
  /** The base plan's price, minor units; absent when none is set. */
  rateMinor?: number;
  /** Stop-sold on the base plan. */
  closed?: boolean;
  /** The base plan's minimum stay that night. */
  minStay?: number;
}

export interface MonthSummary {
  /** "2026-11" */
  month: string;
  /** Booked units over sellable units, 0..1; null when nothing could be sold. */
  occupancy: number | null;
  /** Mean price of the month's priced nights, minor units, rounded half up. */
  averageRateMinor: number | null;
  nights: number;
}

/** Occupancy on the books and the average price, month by month (YEAR-1). */
export function summariseMonths(nights: readonly YearNight[]): MonthSummary[] {
  const by = new Map<string, YearNight[]>();
  for (const n of nights) {
    const k = n.date.slice(0, 7);
    by.set(k, [...(by.get(k) ?? []), n]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, list]) => {
      const sellable = list.reduce((s, n) => s + Math.max(0, n.sellable), 0);
      const booked = list.reduce((s, n) => s + Math.max(0, n.booked), 0);
      const priced = list.filter((n) => n.rateMinor !== undefined);
      const sum = priced.reduce((s, n) => s + n.rateMinor!, 0);
      return {
        month,
        occupancy: sellable === 0 ? null : Math.min(1, booked / sellable),
        averageRateMinor:
          priced.length === 0 ? null : Math.floor((2 * sum + priced.length) / (2 * priced.length)),
        nights: list.length,
      };
    });
}

const lowerMedian = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

/**
 * What a season actually charges, read from the nights themselves rather than stored next to
 * them: the median weeknight and Friday/Saturday price, and the most common minimum stay.
 */
export function seasonPrices(
  nights: readonly YearNight[],
  ranges: readonly SeasonRange[],
): { weekdayMinor: number | null; weekendMinor: number | null; minStay: number | null } {
  const inside = nights.filter((n) => ranges.some((r) => r.from <= n.date && n.date <= r.to));
  const weekday: number[] = [];
  const weekend: number[] = [];
  const stays = new Map<number, number>();
  for (const n of inside) {
    const wd = new Date(`${n.date}T00:00:00Z`).getUTCDay();
    if (n.rateMinor !== undefined) (wd === 5 || wd === 6 ? weekend : weekday).push(n.rateMinor);
    if (n.minStay !== undefined) stays.set(n.minStay, (stays.get(n.minStay) ?? 0) + 1);
  }
  let minStay: number | null = null;
  let best = 0;
  for (const [v, c] of [...stays.entries()].sort(([a], [b]) => a - b))
    if (c > best) {
      best = c;
      minStay = v;
    }
  return { weekdayMinor: lowerMedian(weekday), weekendMinor: lowerMedian(weekend), minStay };
}
