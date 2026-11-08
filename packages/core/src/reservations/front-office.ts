import { LocalDate } from "../shared/local-date.js";
import type { RevisionDiff } from "./types.js";

/**
 * How a reservation reads at the front office (spec 08 §8.1, §8.2): the status, the balance and
 * where the stay is, in words a manager acts on. Pure, so the list, the detail, the check-in board
 * and the guest list say the same thing about the same booking.
 */

/** Who owes what. `ota`: the channel collected and nothing is owed here; `none`: nothing charged. */
export type BalanceState =
  { kind: "ota" } | { kind: "paid" } | { kind: "due"; dueMinor: number } | { kind: "none" };

export interface BalanceInput {
  status: string;
  /** Channex `payment_collect`: `ota` when the guest paid the channel. */
  paymentCollect: string | null;
  totalMinor: number;
  /** Folio lines of kind `room` (posted at daily close). */
  roomChargesMinor: number;
  /** Every other folio line: extras, cleaning, tourist tax, fees, adjustments. */
  otherChargesMinor: number;
  /** Captured minus refunded payments. */
  paidMinor: number;
}

/**
 * The room is owed from the moment of booking, not from the daily close that posts it, so a
 * booking with nothing posted yet still shows its total due. A channel-collected booking owes
 * only what was charged here on top (a tourist tax taken at the door). A cancelled booking owes
 * only its fees.
 */
export function bookingBalance(i: BalanceInput): BalanceState {
  const room =
    i.paymentCollect === "ota"
      ? 0
      : i.status === "cancelled"
        ? i.roomChargesMinor
        : Math.max(i.totalMinor, i.roomChargesMinor);
  const due = room + i.otherChargesMinor - i.paidMinor;
  if (due > 0) return { kind: "due", dueMinor: due };
  if (i.paymentCollect === "ota" && i.status !== "cancelled") return { kind: "ota" };
  if (i.paidMinor > 0) return { kind: "paid" };
  return { kind: "none" };
}

export type StayStatus =
  "cancelled" | "needs_room" | "changed" | "no_show" | "checked_out" | "checked_in" | "confirmed";

/**
 * One word for the list. A booking that needs a room says so before anything else, and a
 * change nobody acknowledged stays visible until someone does (RES-3).
 */
export function stayStatus(i: {
  status: string;
  mappingState: string;
  unassignedRooms: number;
  unacknowledged: boolean;
  /** Per room: expected | checked_in | checked_out | no_show. */
  stayStates: readonly string[];
}): StayStatus {
  if (i.status === "cancelled") return "cancelled";
  if (i.mappingState !== "mapped" || i.unassignedRooms > 0) return "needs_room";
  if (i.unacknowledged) return "changed";
  const s = i.stayStates;
  if (s.length > 0 && s.every((x) => x === "no_show")) return "no_show";
  if (s.length > 0 && s.every((x) => x === "checked_out")) return "checked_out";
  if (s.some((x) => x === "checked_in")) return "checked_in";
  return "confirmed";
}

/** Where the stay is relative to today, a property-local date. Stays are half-open. */
export type StayPhase =
  | { kind: "arrives"; inDays: number }
  | { kind: "in_house"; nightsLeft: number }
  | { kind: "departs_today" }
  | { kind: "departed"; daysAgo: number };

export function stayPhase(today: string, arrival: string, departure: string): StayPhase {
  const t = LocalDate.parse(today);
  const a = LocalDate.parse(arrival);
  const d = LocalDate.parse(departure);
  if (t.isBefore(a)) return { kind: "arrives", inDays: t.daysUntil(a) };
  if (t.equals(a)) return { kind: "arrives", inDays: 0 };
  if (t.isBefore(d)) return { kind: "in_house", nightsLeft: t.daysUntil(d) };
  if (t.equals(d)) return { kind: "departs_today" };
  return { kind: "departed", daysAgo: d.daysUntil(t) };
}

/** The online check-in form (spec 10 §10.6): done, short of guests, or not started. */
export type CheckinFormState =
  | { kind: "done"; listed: number }
  | { kind: "missing_guests"; missing: number; listed: number }
  | { kind: "not_started"; listed: 0 };

/**
 * A saved form with no names on it still lists the person who booked: they filled it in.
 * Everyone else the booking expects has to be named for the registration.
 */
export function checkinFormState(i: {
  completedAt: string | null;
  guestsListed: number;
  guestsExpected: number;
}): CheckinFormState {
  if (!i.completedAt) return { kind: "not_started", listed: 0 };
  const listed = Math.max(1, i.guestsListed);
  const missing = Math.max(0, i.guestsExpected - listed);
  return missing > 0 ? { kind: "missing_guests", missing, listed } : { kind: "done", listed };
}

/**
 * "Ana Silva" → Ana / Silva; "Maria do Carmo Silva" → Maria / do Carmo Silva. One box for the
 * name on the staff form; the given name is the first word, the rest is the surname, which is what
 * the dedupe key and the OTAs use. Null when there is only one word.
 */
export function splitFullName(full: string): { name: string; surname: string } | null {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return { name: words[0]!, surname: words.slice(1).join(" ") };
}

/** One timeline entry per revision, as data the screen words: what changed, from what, to what. */
export type RevisionEvent =
  | { kind: "booked" }
  | { kind: "cancelled" }
  | {
      kind: "dates_changed";
      from: { arrival: string; departure: string };
      to: { arrival: string; departure: string };
    }
  | { kind: "guests_changed"; from: number; to: number }
  | { kind: "amount_changed"; fromMinor: number | null; toMinor: number }
  | { kind: "updated" };

export function revisionEvent(i: {
  diff: RevisionDiff | null;
  revisionType: string;
  amountMinor: number;
  previousAmountMinor: number | null;
  guests: number;
  previousGuests: number | null;
}): RevisionEvent {
  const d = i.diff;
  if (i.revisionType === "cancelled" || d?.statusChanged?.to === "cancelled")
    return { kind: "cancelled" };
  if (!d || d.first || i.previousGuests === null) return { kind: "booked" };
  if (d.datesChanged?.from)
    return { kind: "dates_changed", from: d.datesChanged.from, to: d.datesChanged.to };
  if (i.guests !== i.previousGuests)
    return { kind: "guests_changed", from: i.previousGuests, to: i.guests };
  if (
    d.amountChanged ||
    (i.previousAmountMinor !== null && i.previousAmountMinor !== i.amountMinor)
  )
    return { kind: "amount_changed", fromMinor: i.previousAmountMinor, toMinor: i.amountMinor };
  return { kind: "updated" };
}

/**
 * A total typed over the rate plan's price (the staff form's "Total" box): spread across the
 * nights in proportion to their prices, in whole minor units, the remainder on the last night,
 * so the nights always sum to exactly the total asked for.
 */
export function spreadTotal(
  nightly: Readonly<Record<string, number>>,
  totalMinor: number,
): Record<string, number> {
  const dates = Object.keys(nightly).sort();
  if (dates.length === 0) return {};
  const base = dates.reduce((a, d) => a + Math.max(0, nightly[d] ?? 0), 0);
  const out: Record<string, number> = {};
  let used = 0;
  dates.forEach((d, i) => {
    if (i === dates.length - 1) {
      out[d] = totalMinor - used;
      return;
    }
    const share =
      base > 0
        ? Math.floor((totalMinor * Math.max(0, nightly[d] ?? 0)) / base)
        : Math.floor(totalMinor / dates.length);
    out[d] = share;
    used += share;
  });
  return out;
}
