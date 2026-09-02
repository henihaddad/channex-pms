import type { BookingRevisionPayload } from "../connectivity/port.js";
import type { BookingProjection, MappingState, RevisionDiff } from "./types.js";

/** Revisions apply in (inserted_at, system_id) order (BK-5). Returns true if `rev` is newer than the projection. */
export function isNewerThan(
  rev: BookingRevisionPayload,
  projection: BookingProjection | null,
): boolean {
  if (!projection) return true;
  if (rev.insertedAt !== projection.lastInsertedAt)
    return rev.insertedAt > projection.lastInsertedAt;
  return rev.systemId > projection.lastSystemId;
}

export function mappingStateOf(rev: BookingRevisionPayload): MappingState {
  if (rev.rooms.some((r) => r.roomTypeId === null)) return "unmapped_room";
  if (rev.rooms.some((r) => r.ratePlanId === null)) return "unmapped_rate";
  return "mapped";
}

export function projectRevision(rev: BookingRevisionPayload, bookingId: string): BookingProjection {
  return {
    bookingId,
    channexBookingId: rev.bookingId,
    propertyId: rev.propertyId,
    status: rev.status,
    arrivalDate: rev.arrivalDate,
    departureDate: rev.departureDate,
    currency: rev.currency,
    totalAmountMinor: rev.amount,
    otaCommissionMinor: rev.otaCommission ?? null,
    otaName: rev.otaName,
    otaReservationCode: rev.otaReservationCode,
    mappingState: mappingStateOf(rev),
    rooms: rev.rooms.map((r) => ({
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      days: r.days,
      occupancy: r.occupancy,
      guests: r.guests,
    })),
    customer: rev.customer,
    lastInsertedAt: rev.insertedAt,
    lastSystemId: rev.systemId,
    lastRevisionId: rev.revisionId,
  };
}

/** Booked room-nights of a projection: cancelled bookings hold none. */
export function bookedNights(
  p: BookingProjection | null,
): Array<{ roomTypeId: string | null; date: string }> {
  if (!p || p.status === "cancelled") return [];
  const out: Array<{ roomTypeId: string | null; date: string }> = [];
  for (const r of p.rooms)
    for (const date of Object.keys(r.days)) out.push({ roomTypeId: r.roomTypeId, date });
  return out;
}

export function diffProjection(
  prev: BookingProjection | null,
  next: BookingProjection,
): RevisionDiff {
  const key = (n: { roomTypeId: string | null; date: string }) =>
    `${n.roomTypeId ?? "?"}|${n.date}`;
  const before = new Map(bookedNights(prev).map((n) => [key(n), n]));
  const after = new Map(bookedNights(next).map((n) => [key(n), n]));
  return {
    first: prev === null,
    statusChanged:
      prev?.status === next.status ? null : { from: prev?.status ?? null, to: next.status },
    datesChanged:
      prev && prev.arrivalDate === next.arrivalDate && prev.departureDate === next.departureDate
        ? null
        : {
            from: prev ? { arrival: prev.arrivalDate, departure: prev.departureDate } : null,
            to: { arrival: next.arrivalDate, departure: next.departureDate },
          },
    amountChanged: prev?.totalAmountMinor !== next.totalAmountMinor,
    nightsAdded: [...after.entries()].filter(([k]) => !before.has(k)).map(([, n]) => n),
    nightsRemoved: [...before.entries()].filter(([k]) => !after.has(k)).map(([, n]) => n),
    mappingState: next.mappingState,
  };
}
