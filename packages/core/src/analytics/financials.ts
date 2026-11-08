/**
 * The arithmetic behind the Financials and Reports overviews (spec 11 §11.5b): channel
 * buckets, revenue per month per bucket, occupancy per ISO week and sums that never add
 * two currencies together (rule 4). Pure; the repositories hand it rows.
 *
 * Persona: the `finance` manager and the `org_owner` asking "how is money doing".
 */

/** The three channels the design names, and everything else. */
export type ChannelBucket = "airbnb" | "booking_com" | "direct" | "other";
export const CHANNEL_BUCKETS: readonly ChannelBucket[] = [
  "airbnb",
  "booking_com",
  "direct",
  "other",
];

const DIRECT = new Set([
  "",
  "direct",
  "staff",
  "phone",
  "walk_in",
  "walk-in",
  "booking_engine",
  "website",
  "owner",
]);

/** Which bucket a channel name falls in: our own sources first, so "booking_engine" is direct. */
export function channelBucket(channel: string | null | undefined): ChannelBucket {
  const c = (channel ?? "").trim().toLowerCase();
  if (DIRECT.has(c)) return "direct";
  if (c.includes("airbnb")) return "airbnb";
  if (c.includes("booking")) return "booking_com";
  return "other";
}

export interface CurrencyAmount {
  currency: string;
  minor: number;
}

/**
 * One total per currency, largest first. Amounts in different currencies are never
 * added; a page shows "€4,812 · ZAR 3,350" rather than a number that would be a lie.
 */
export function sumByCurrency(rows: readonly CurrencyAmount[]): CurrencyAmount[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (!Number.isInteger(r.minor)) throw new Error(`minor units must be integers: ${r.minor}`);
    by.set(r.currency, (by.get(r.currency) ?? 0) + r.minor);
  }
  return [...by.entries()]
    .filter(([, minor]) => minor !== 0)
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor) || a.currency.localeCompare(b.currency));
}

/** `count` months ending with `month` ("2026-11"), oldest first. */
export function monthsEnding(month: string, count: number): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`not a month: ${month}`);
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + m - i;
    out.push(
      `${String(Math.floor(idx / 12)).padStart(4, "0")}-${String((idx % 12) + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

export interface MonthChannelRevenue {
  month: string;
  channel: string;
  currency: string;
  revenueMinor: number;
}

export interface MonthRevenue {
  month: string;
  buckets: Record<ChannelBucket, number>;
  totalMinor: number;
}

/** Revenue per month per channel bucket, in one currency; months with nothing read as zero. */
export function revenueByMonth(
  rows: readonly MonthChannelRevenue[],
  months: readonly string[],
  currency: string,
): MonthRevenue[] {
  const out = new Map<string, MonthRevenue>(
    months.map((m) => [
      m,
      { month: m, buckets: { airbnb: 0, booking_com: 0, direct: 0, other: 0 }, totalMinor: 0 },
    ]),
  );
  for (const r of rows) {
    const e = out.get(r.month);
    if (!e || r.currency !== currency) continue;
    e.buckets[channelBucket(r.channel)] += r.revenueMinor;
    e.totalMinor += r.revenueMinor;
  }
  return months.map((m) => out.get(m)!);
}

/** The currency most of the rows are in, by absolute amount; `fallback` when there are none. */
export function dominantCurrency(rows: readonly CurrencyAmount[], fallback: string): string {
  return (
    sumByCurrency(rows.map((r) => ({ currency: r.currency, minor: Math.abs(r.minor) })))[0]
      ?.currency ?? fallback
  );
}

/** ISO-8601 week of a date: weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeek(date: string): { year: number; week: number; monday: string } {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getTime() - dow * 86_400_000);
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / (7 * 86_400_000)) + 1;
  return { year, week, monday: monday.toISOString().slice(0, 10) };
}

export interface WeekOccupancy {
  week: number;
  monday: string;
  roomsAvailable: number;
  roomsSold: number;
  /** Basis points; null when nothing was available that week. */
  occupancyBps: number | null;
}

/** Occupancy per ISO week from daily rows (any number of properties per day). */
export function weeklyOccupancy(
  rows: readonly { date: string; roomsAvailable: number; roomsSold: number }[],
): WeekOccupancy[] {
  const by = new Map<string, WeekOccupancy>();
  for (const r of rows) {
    const w = isoWeek(r.date);
    const e = by.get(w.monday) ?? {
      week: w.week,
      monday: w.monday,
      roomsAvailable: 0,
      roomsSold: 0,
      occupancyBps: null,
    };
    e.roomsAvailable += r.roomsAvailable;
    e.roomsSold += r.roomsSold;
    by.set(w.monday, e);
  }
  return [...by.values()]
    .sort((a, b) => (a.monday < b.monday ? -1 : 1))
    .map((e) => ({
      ...e,
      occupancyBps:
        e.roomsAvailable > 0 ? Math.round((e.roomsSold * 10_000) / e.roomsAvailable) : null,
    }));
}
