import type { BookingRevisionPayload } from "../connectivity/port.js";
import type { RateCell, RestrictionValues } from "../inventory/ari.js";
import { Id } from "../shared/id.js";
import { LocalDate } from "../shared/local-date.js";
import { DomainError, err, ok, type Result } from "../shared/result.js";

export interface SellCheck {
  ok: boolean;
  reasons: string[];
  totalMinor: number;
  nightly: Record<string, number>;
}

/**
 * BE-2 for the staff path: a stay is sellable when every night has a rate, is
 * not stop-sold, has availability, arrival is not CTA, departure not CTD, and
 * min/max stay hold. Same rules the booking engine uses (spec 08 §8.11: one path).
 */
export function checkSellable(input: {
  arrivalDate: string;
  departureDate: string;
  rateCells: readonly RateCell[];
  availability: ReadonlyMap<string, number>;
}): SellCheck {
  const reasons: string[] = [];
  const nightly: Record<string, number> = {};
  const arrival = LocalDate.parse(input.arrivalDate);
  const departure = LocalDate.parse(input.departureDate);
  const nights = arrival.daysUntil(departure);
  if (nights < 1)
    return { ok: false, reasons: ["departure must be after arrival"], totalMinor: 0, nightly };
  const cells = new Map(input.rateCells.map((c) => [c.date, c.values]));
  const first = cells.get(input.arrivalDate);
  if (first?.closedToArrival) reasons.push(`closed to arrival on ${input.arrivalDate}`);
  const lastNight = departure.minusDays(1).toString();
  const lastCell = cells.get(lastNight);
  if (lastCell?.closedToDeparture) reasons.push(`closed to departure on ${input.departureDate}`);
  const minStay = Math.max(first?.minStayArrival ?? 0, first?.minStay ?? 0);
  if (minStay > nights) reasons.push(`minimum stay ${String(minStay)} nights`);
  for (let d = arrival; d.isBefore(departure); d = d.plusDays(1)) {
    const v: RestrictionValues | undefined = cells.get(d.toString());
    if (!v || v.rate === undefined) {
      reasons.push(`no rate for ${d.toString()}`);
      continue;
    }
    if (v.stopSell) reasons.push(`stop sell on ${d.toString()}`);
    if (v.minStayThrough && v.minStayThrough > nights)
      reasons.push(`minimum stay through ${String(v.minStayThrough)} on ${d.toString()}`);
    if (v.maxStay && v.maxStay < nights)
      reasons.push(`maximum stay ${String(v.maxStay)} on ${d.toString()}`);
    if ((input.availability.get(d.toString()) ?? 0) < 1)
      reasons.push(`no availability on ${d.toString()}`);
    nightly[d.toString()] = v.rate;
  }
  const totalMinor = Object.values(nightly).reduce((a, b) => a + b, 0);
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], totalMinor, nightly };
}

export interface StaffBookingInput {
  bookingId: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  arrivalDate: string;
  departureDate: string;
  currency: string;
  occupancy: { adults: number; children: number; infants: number; ages?: number[] };
  customer: {
    name: string;
    surname: string;
    email?: string;
    phone?: string;
    language?: string;
    country?: string;
  };
  source: "direct" | "staff" | "phone" | "walk_in";
  nowIso: string;
}

/**
 * Staff and direct bookings are revisions like any other (spec 08 §8.11): the
 * result goes through the same apply path as an OTA revision, so availability,
 * turnover, credentials and statements never learn a second way of hearing about a stay.
 */
export function directBookingRevision(
  input: StaffBookingInput,
  check: SellCheck,
): Result<BookingRevisionPayload> {
  if (!check.ok) return err(new DomainError("booking.not_sellable", check.reasons.join("; ")));
  if (!input.customer.name.trim() || !input.customer.surname.trim())
    return err(new DomainError("booking.guest", "guest name and surname are required"));
  // revision ids are UUIDs like Channex's; the system id carries the human-readable sequence
  const systemId = `${input.source}:${input.bookingId}:1`;
  return ok({
    revisionId: Id.next(),
    bookingId: `${input.source}:${input.bookingId}`,
    systemId,
    propertyId: input.propertyId,
    status: "new",
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    currency: input.currency,
    amount: check.totalMinor,
    otaName: input.source,
    otaReservationCode: input.bookingId.slice(0, 8).toUpperCase(),
    insertedAt: input.nowIso,
    rooms: [
      {
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId,
        checkinDate: input.arrivalDate,
        checkoutDate: input.departureDate,
        days: check.nightly,
        occupancy: input.occupancy,
        guests: [{ name: input.customer.name, surname: input.customer.surname }],
      },
    ],
    customer: input.customer,
    services: [],
    taxes: [],
    raw: { source: input.source },
  });
}

/** A later revision of a direct booking (modify or cancel) on the same path. */
export function directBookingChange(
  previous: BookingRevisionPayload,
  change: {
    status: "modified" | "cancelled";
    arrivalDate?: string;
    departureDate?: string;
    nightly?: Record<string, number>;
    nowIso: string;
    sequence: number;
  },
): BookingRevisionPayload {
  const systemId = `${previous.bookingId}:${String(change.sequence)}`;
  const room = previous.rooms[0];
  const days = change.status === "cancelled" ? {} : (change.nightly ?? room?.days ?? {});
  return {
    ...previous,
    revisionId: Id.next(),
    systemId,
    status: change.status,
    arrivalDate: change.arrivalDate ?? previous.arrivalDate,
    departureDate: change.departureDate ?? previous.departureDate,
    amount: Object.values(days).reduce((a, b) => a + b, 0),
    insertedAt: change.nowIso,
    rooms: room
      ? [
          {
            ...room,
            checkinDate: change.arrivalDate ?? room.checkinDate,
            checkoutDate: change.departureDate ?? room.checkoutDate,
            days,
          },
        ]
      : [],
  };
}
