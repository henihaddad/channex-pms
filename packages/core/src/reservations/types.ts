import type { BookingRevisionPayload } from "../connectivity/port.js";

export type MappingState = "mapped" | "unmapped_room" | "unmapped_rate";

/** The booking projection: what the ordered revisions fold to (spec 03 §3.5). */
export interface BookingProjection {
  bookingId: string;
  channexBookingId: string;
  propertyId: string;
  status: "new" | "modified" | "cancelled";
  arrivalDate: string;
  departureDate: string;
  currency: string;
  totalAmountMinor: number;
  otaCommissionMinor: number | null;
  otaName: string;
  otaReservationCode: string;
  mappingState: MappingState;
  rooms: Array<{
    roomTypeId: string | null;
    ratePlanId: string | null;
    checkinDate: string;
    checkoutDate: string;
    days: Record<string, number>;
    occupancy: { adults: number; children: number; infants: number; ages?: number[] };
    guests: Array<{ name: string; surname: string }>;
  }>;
  customer: BookingRevisionPayload["customer"];
  /** Ordering key of the last applied revision: (inserted_at, system_id). */
  lastInsertedAt: string;
  lastSystemId: string;
  lastRevisionId: string;
}

/** What changed between the previous projection and this revision; consumers subscribe to this (spec 03 §3.5). */
export interface RevisionDiff {
  first: boolean;
  statusChanged: { from: string | null; to: string } | null;
  datesChanged: {
    from: { arrival: string; departure: string } | null;
    to: { arrival: string; departure: string };
  } | null;
  amountChanged: boolean;
  /** Room nights that became booked or freed. */
  nightsAdded: Array<{ roomTypeId: string | null; date: string }>;
  nightsRemoved: Array<{ roomTypeId: string | null; date: string }>;
  mappingState: MappingState;
}
