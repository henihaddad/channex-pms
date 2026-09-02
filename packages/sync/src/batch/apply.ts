import type {
  AvailabilityCell,
  AvailabilityEntry,
  RateCell,
  RestrictionEntry,
  RestrictionValues,
} from "@pms/core";
import { expandDates } from "./dates.js";

/** In-memory ARI state keyed by (ratePlanId|date) and (roomTypeId|date). The oracle for the batch builder. */
export interface AriState {
  restrictions: Map<string, RestrictionValues>;
  availability: Map<string, number>;
}

export const emptyState = (): AriState => ({ restrictions: new Map(), availability: new Map() });
export const rateKey = (ratePlanId: string, date: string): string => `${ratePlanId}|${date}`;
export const availKey = (roomTypeId: string, date: string): string => `${roomTypeId}|${date}`;

const FIELDS = [
  "rate",
  "rates",
  "minStay",
  "minStayArrival",
  "minStayThrough",
  "maxStay",
  "closedToArrival",
  "closedToDeparture",
  "stopSell",
] as const;

/** Channex semantics: entries are processed FIFO; each sets only the fields it carries. Mutates and returns `state`. */
export function applyRestrictionEntries(
  state: AriState,
  entries: readonly RestrictionEntry[],
): AriState {
  for (const e of entries) {
    for (const date of expandDates(e.dateFrom, e.dateTo, e.days)) {
      const k = rateKey(e.ratePlanId, date);
      const cur = { ...(state.restrictions.get(k) ?? {}) };
      for (const f of FIELDS) if (e[f] !== undefined) (cur as Record<string, unknown>)[f] = e[f];
      state.restrictions.set(k, cur);
    }
  }
  return state;
}

export function applyAvailabilityEntries(
  state: AriState,
  entries: readonly AvailabilityEntry[],
): AriState {
  for (const e of entries)
    for (const date of expandDates(e.dateFrom, e.dateTo, e.days))
      state.availability.set(availKey(e.roomTypeId, date), e.availability);
  return state;
}

export function stateFromCells(
  rate: readonly RateCell[],
  avail: readonly AvailabilityCell[] = [],
): AriState {
  const s = emptyState();
  for (const c of rate) {
    const cur = s.restrictions.get(rateKey(c.ratePlanId, c.date)) ?? {};
    s.restrictions.set(rateKey(c.ratePlanId, c.date), { ...cur, ...definedOnly(c.values) });
  }
  for (const c of avail) s.availability.set(availKey(c.roomTypeId, c.date), c.availability);
  return s;
}

function definedOnly(v: RestrictionValues): RestrictionValues {
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
}

/** Cells whose desired values differ from the mirror, in both directions (spec 05 §5.4.6). */
export function diffAri(
  desired: AriState,
  mirror: AriState,
): { restrictions: string[]; availability: string[] } {
  const restrictions: string[] = [];
  for (const [k, v] of desired.restrictions)
    if (JSON.stringify(sorted(v)) !== JSON.stringify(sorted(mirror.restrictions.get(k) ?? {})))
      restrictions.push(k);
  for (const k of mirror.restrictions.keys())
    if (!desired.restrictions.has(k)) restrictions.push(k);
  const availability: string[] = [];
  for (const [k, v] of desired.availability)
    if (mirror.availability.get(k) !== v) availability.push(k);
  for (const k of mirror.availability.keys())
    if (!desired.availability.has(k)) availability.push(k);
  return {
    restrictions: [...new Set(restrictions)].sort(),
    availability: [...new Set(availability)].sort(),
  };
}

function sorted(v: RestrictionValues): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}
