/**
 * Spec 11 §11.1: every number is defined once, here. Screens, rollups and
 * exports all call these functions; the integration test asserts the SQL rollup
 * agrees with them. Ratios are basis points (integers) so two screens can be
 * compared for exact equality; money is integer minor units.
 */
export interface DailyFact {
  date: string;
  roomsAvailable: number;
  roomsSold: number;
  roomRevenueMinor: number;
  totalRevenueMinor: number;
  commissionMinor: number;
  withheldTaxMinor: number;
  bookingsCreated: number;
  cancellations: number;
  arrivals: number;
  noShows: number;
  directNights: number;
}

export type KpiKey =
  | "rooms_available"
  | "rooms_sold"
  | "occupancy"
  | "adr"
  | "revpar"
  | "trevpar"
  | "net_adr"
  | "alos"
  | "lead_time"
  | "pickup"
  | "pace"
  | "cancellation_rate"
  | "no_show_rate"
  | "channel_mix"
  | "commission_cost"
  | "direct_share"
  | "forecast"
  | "sync_health"
  | "first_response_time"
  | "review_score";

export interface KpiDefinition {
  key: KpiKey;
  name: string;
  formula: string;
  unit: "count" | "bps" | "money" | "days" | "nights" | "score";
  notes: string;
}

export const KPI_DICTIONARY: Readonly<Record<KpiKey, KpiDefinition>> = {
  rooms_available: {
    key: "rooms_available",
    name: "Rooms available",
    formula: "Σ count_of_rooms − out_of_order per night",
    unit: "count",
    notes: "Excludes OOO, includes OOS.",
  },
  rooms_sold: {
    key: "rooms_sold",
    name: "Rooms sold",
    formula: "confirmed room-nights (cancellations and no-shows excluded)",
    unit: "nights",
    notes: "From booking_room_day.",
  },
  occupancy: {
    key: "occupancy",
    name: "Occupancy",
    formula: "rooms sold ÷ rooms available",
    unit: "bps",
    notes: "Must never disagree between screens.",
  },
  adr: {
    key: "adr",
    name: "ADR",
    formula: "room revenue ÷ rooms sold",
    unit: "money",
    notes: "Room revenue only: no extras, no taxes.",
  },
  revpar: {
    key: "revpar",
    name: "RevPAR",
    formula: "room revenue ÷ rooms available",
    unit: "money",
    notes: "= occupancy × ADR.",
  },
  trevpar: {
    key: "trevpar",
    name: "TRevPAR",
    formula: "total revenue (incl. extras) ÷ rooms available",
    unit: "money",
    notes: "",
  },
  net_adr: {
    key: "net_adr",
    name: "Net ADR",
    formula: "(room revenue − commission − withheld taxes) ÷ rooms sold",
    unit: "money",
    notes: "Whether a channel is worth it.",
  },
  alos: { key: "alos", name: "ALOS", formula: "room-nights ÷ bookings", unit: "nights", notes: "" },
  lead_time: {
    key: "lead_time",
    name: "Booking lead time",
    formula: "median days between booking and arrival",
    unit: "days",
    notes: "Per channel; drives yield windows.",
  },
  pickup: {
    key: "pickup",
    name: "Pickup",
    formula: "room-nights gained for a target period over the last N days",
    unit: "nights",
    notes: "From on-the-books snapshots.",
  },
  pace: {
    key: "pace",
    name: "Pace / OTB vs STLY",
    formula: "on-the-books now vs the same time last year",
    unit: "nights",
    notes: "Unavailable until 12 months of snapshots exist.",
  },
  cancellation_rate: {
    key: "cancellation_rate",
    name: "Cancellation rate",
    formula: "cancelled bookings ÷ bookings created",
    unit: "bps",
    notes: "Split by channel.",
  },
  no_show_rate: {
    key: "no_show_rate",
    name: "No-show rate",
    formula: "no-shows ÷ arrivals",
    unit: "bps",
    notes: "",
  },
  channel_mix: {
    key: "channel_mix",
    name: "Channel mix",
    formula: "share of room-nights and revenue per channel",
    unit: "bps",
    notes: "Direct is a channel.",
  },
  commission_cost: {
    key: "commission_cost",
    name: "Commission cost",
    formula: "Σ OTA commission",
    unit: "money",
    notes: "Estimated channels are labelled.",
  },
  direct_share: {
    key: "direct_share",
    name: "Direct share",
    formula: "direct room-nights ÷ rooms sold",
    unit: "bps",
    notes: "The headline metric.",
  },
  forecast: {
    key: "forecast",
    name: "Forecast",
    formula: "on-the-books + expected pickup − expected cancellations",
    unit: "nights",
    notes: "Simple, explainable model in v1.",
  },
  sync_health: {
    key: "sync_health",
    name: "Sync health",
    formula: "pending / failed / drifted cells, unacked bookings",
    unit: "count",
    notes: "Operational.",
  },
  first_response_time: {
    key: "first_response_time",
    name: "First response time",
    formula: "median guest-message first reply",
    unit: "days",
    notes: "Minutes, per channel and agent.",
  },
  review_score: {
    key: "review_score",
    name: "Review score",
    formula: "weighted average per channel",
    unit: "score",
    notes: "Plus trend.",
  },
};

export interface KpiSet {
  roomsAvailable: number;
  roomsSold: number;
  roomRevenueMinor: number;
  totalRevenueMinor: number;
  commissionMinor: number;
  withheldTaxMinor: number;
  bookingsCreated: number;
  cancellations: number;
  arrivals: number;
  noShows: number;
  directNights: number;
  /** Basis points, or null when the denominator is zero. */
  occupancyBps: number | null;
  adrMinor: number | null;
  revparMinor: number | null;
  trevparMinor: number | null;
  netAdrMinor: number | null;
  cancellationRateBps: number | null;
  noShowRateBps: number | null;
  directShareBps: number | null;
}

const ratioBps = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num * 10_000) / den) : null;
const perUnit = (minor: number, den: number): number | null =>
  den > 0 ? Math.round(minor / den) : null;
const sum = (rows: readonly DailyFact[], k: keyof DailyFact): number =>
  rows.reduce((a, r) => a + Number(r[k]), 0);

/** The KPI set over any range of daily facts (a day, a month, a property, a portfolio). */
export function kpis(rows: readonly DailyFact[]): KpiSet {
  const roomsAvailable = sum(rows, "roomsAvailable");
  const roomsSold = sum(rows, "roomsSold");
  const roomRevenueMinor = sum(rows, "roomRevenueMinor");
  const totalRevenueMinor = sum(rows, "totalRevenueMinor");
  const commissionMinor = sum(rows, "commissionMinor");
  const withheldTaxMinor = sum(rows, "withheldTaxMinor");
  const bookingsCreated = sum(rows, "bookingsCreated");
  const cancellations = sum(rows, "cancellations");
  const arrivals = sum(rows, "arrivals");
  const noShows = sum(rows, "noShows");
  const directNights = sum(rows, "directNights");
  return {
    roomsAvailable,
    roomsSold,
    roomRevenueMinor,
    totalRevenueMinor,
    commissionMinor,
    withheldTaxMinor,
    bookingsCreated,
    cancellations,
    arrivals,
    noShows,
    directNights,
    occupancyBps: ratioBps(roomsSold, roomsAvailable),
    adrMinor: perUnit(roomRevenueMinor, roomsSold),
    revparMinor: perUnit(roomRevenueMinor, roomsAvailable),
    trevparMinor: perUnit(totalRevenueMinor, roomsAvailable),
    netAdrMinor: perUnit(roomRevenueMinor - commissionMinor - withheldTaxMinor, roomsSold),
    cancellationRateBps: ratioBps(cancellations, bookingsCreated),
    noShowRateBps: ratioBps(noShows, arrivals),
    directShareBps: ratioBps(directNights, roomsSold),
  };
}

export const alos = (roomNights: number, bookings: number): number | null =>
  bookings > 0 ? Math.round((roomNights * 10) / bookings) / 10 : null;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

export interface Snapshot {
  stayDate: string;
  snapshotDate: string;
  roomsSold: number;
  roomRevenueMinor: number;
}

/** Pickup: room-nights for stay dates in [from, to) gained between the snapshot `daysBack` days before `asOf` and the latest one. */
export function pickup(
  snapshots: readonly Snapshot[],
  target: { from: string; to: string },
  asOf: string,
  daysBack: number,
): { nights: number; revenueMinor: number; baselineDate: string | null } {
  const inTarget = snapshots.filter(
    (s) => s.stayDate >= target.from && s.stayDate < target.to && s.snapshotDate <= asOf,
  );
  if (inTarget.length === 0) return { nights: 0, revenueMinor: 0, baselineDate: null };
  const latest = inTarget.reduce((a, s) => (s.snapshotDate > a ? s.snapshotDate : a), "");
  const cutoff = shiftDate(asOf, -daysBack);
  const baselineDates = inTarget.map((s) => s.snapshotDate).filter((d) => d <= cutoff);
  const baseline = baselineDates.length
    ? baselineDates.reduce((a, d) => (d > a ? d : a), "")
    : null;
  const total = (date: string | null, k: keyof Snapshot) =>
    date
      ? inTarget.filter((s) => s.snapshotDate === date).reduce((a, s) => a + Number(s[k]), 0)
      : 0;
  return {
    nights: total(latest, "roomsSold") - total(baseline, "roomsSold"),
    revenueMinor: total(latest, "roomRevenueMinor") - total(baseline, "roomRevenueMinor"),
    baselineDate: baseline,
  };
}

/** Pace: on-the-books today for a target period against the same snapshot distance last year; unavailable before a year of snapshots (spec 11 §11.6). */
export function pace(
  snapshots: readonly Snapshot[],
  target: { from: string; to: string },
  asOf: string,
): {
  available: boolean;
  otbNights: number;
  stlyNights: number | null;
  deltaBps: number | null;
  reason?: string;
} {
  const now = snapshots.filter(
    (s) => s.snapshotDate === asOf && s.stayDate >= target.from && s.stayDate < target.to,
  );
  const otbNights = now.reduce((a, s) => a + s.roomsSold, 0);
  const lastYearAsOf = shiftYear(asOf, -1);
  const stly = snapshots.filter(
    (s) =>
      s.snapshotDate === lastYearAsOf &&
      s.stayDate >= shiftYear(target.from, -1) &&
      s.stayDate < shiftYear(target.to, -1),
  );
  if (stly.length === 0)
    return {
      available: false,
      otbNights,
      stlyNights: null,
      deltaBps: null,
      reason: "no snapshot from the same time last year yet",
    };
  const stlyNights = stly.reduce((a, s) => a + s.roomsSold, 0);
  return {
    available: true,
    otbNights,
    stlyNights,
    deltaBps: stlyNights > 0 ? Math.round(((otbNights - stlyNights) * 10_000) / stlyNights) : null,
  };
}

/** v1 forecast: on the books plus the recent pickup rate projected over the days left, minus the expected cancellations. */
export function forecast(input: {
  otbNights: number;
  pickupLast7: number;
  daysOut: number;
  cancellationRateBps: number | null;
  roomsAvailable: number;
}): { nights: number; occupancyBps: number | null } {
  const dailyPickup = input.pickupLast7 / 7;
  const expectedPickup = Math.max(0, Math.round(dailyPickup * Math.min(input.daysOut, 60)));
  const expectedCancellations = Math.round(
    ((input.otbNights + expectedPickup) * (input.cancellationRateBps ?? 0)) / 10_000,
  );
  const nights = Math.min(
    input.roomsAvailable,
    Math.max(0, input.otbNights + expectedPickup - expectedCancellations),
  );
  return { nights, occupancyBps: ratioBps(nights, input.roomsAvailable) };
}

export interface ChannelRow {
  channel: string;
  nights: number;
  revenueMinor: number;
  commissionMinor: number;
  commissionEstimated: boolean;
}
export function channelMix(rows: readonly ChannelRow[]): Array<
  ChannelRow & {
    nightShareBps: number | null;
    revenueShareBps: number | null;
    netAdrMinor: number | null;
  }
> {
  const nights = rows.reduce((a, r) => a + r.nights, 0);
  const revenue = rows.reduce((a, r) => a + r.revenueMinor, 0);
  return [...rows]
    .sort((a, b) => b.nights - a.nights || a.channel.localeCompare(b.channel))
    .map((r) => ({
      ...r,
      nightShareBps: ratioBps(r.nights, nights),
      revenueShareBps: ratioBps(r.revenueMinor, revenue),
      netAdrMinor: perUnit(r.revenueMinor - r.commissionMinor, r.nights),
    }));
}

/** "Compare to": deltas in basis points of the previous value (null when it was zero or missing). */
export function compare(
  current: KpiSet,
  previous: KpiSet,
): Partial<Record<keyof KpiSet, number | null>> {
  const out: Partial<Record<keyof KpiSet, number | null>> = {};
  for (const k of Object.keys(current) as Array<keyof KpiSet>) {
    const a = current[k];
    const b = previous[k];
    out[k] =
      a === null || b === null || b === 0 ? null : Math.round(((a - b) * 10_000) / Math.abs(b));
  }
  return out;
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function shiftYear(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
