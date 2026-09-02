/**
 * The ARI cell model (spec 03 §3.3, spec 05 §5.4). Availability is a property
 * of the room type; rates and restrictions are a property of the rate plan.
 * Every cell is a desired/synced pair with a sync state.
 */
export const WEEKDAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type SyncState = "pending" | "in_flight" | "synced" | "failed" | "conflicted";

/** Restriction fields Channex accepts per rate plan and date (spec 05 §5.4). Rates are minor units. */
export interface RestrictionValues {
  rate?: number;
  /** occupancy → rate in minor units, for multi-occupancy plans. */
  rates?: Record<number, number>;
  minStay?: number;
  minStayArrival?: number;
  minStayThrough?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
}

export const RESTRICTION_FIELDS = [
  "rate",
  "rates",
  "minStay",
  "minStayArrival",
  "minStayThrough",
  "maxStay",
  "closedToArrival",
  "closedToDeparture",
  "stopSell",
] as const satisfies readonly (keyof RestrictionValues)[];

export type RestrictionField = (typeof RESTRICTION_FIELDS)[number];

export interface RateCell {
  ratePlanId: string;
  /** ISO date, property-local. */
  date: string;
  values: RestrictionValues;
}

export interface AvailabilityCell {
  roomTypeId: string;
  date: string;
  availability: number;
}

/** Wire entries, one per Channex `values[]` element. Dates are inclusive. */
export interface RestrictionEntry extends RestrictionValues {
  ratePlanId: string;
  dateFrom: string;
  dateTo: string;
  days?: Weekday[];
}

export interface AvailabilityEntry {
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
  days?: Weekday[];
  availability: number;
}

export interface BatchLimits {
  /** Maximum entries per request. */
  maxEntries: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = { maxEntries: 500 };

/**
 * Derived availability (spec 05 §5.4.2). Staff never type availability for a
 * date with bookings; it is computed. Negative results are clamped to zero and
 * reported so the caller can raise an overbooking alert.
 */
export function computeAvailable(input: {
  countOfRooms: number;
  booked: number;
  outOfOrder: number;
  blocks: number;
  keepBack: number;
}): { available: number; overbookedBy: number } {
  const raw = input.countOfRooms - input.booked - input.outOfOrder - input.blocks - input.keepBack;
  return raw < 0 ? { available: 0, overbookedBy: -raw } : { available: raw, overbookedBy: 0 };
}

/** Per-cell sync state machine (spec 05 §5.4.5). Returns null for an illegal transition. */
export function nextSyncState(
  current: SyncState,
  event: "edit" | "push" | "ok" | "fail" | "retry" | "drift",
): SyncState | null {
  switch (event) {
    case "edit":
      return "pending";
    case "push":
      return current === "pending" || current === "failed" || current === "conflicted"
        ? "in_flight"
        : null;
    case "ok":
      return current === "in_flight" ? "synced" : null;
    case "fail":
      return current === "in_flight" ? "failed" : null;
    case "retry":
      return current === "failed" ? "in_flight" : null;
    case "drift":
      return "conflicted";
  }
}
