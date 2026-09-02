import { eq, sql } from "drizzle-orm";
import {
  Id,
  type BookingProjection,
  type BookingRepository,
  type BookingRevisionPayload,
  type Crypto,
  type DomainEvent,
  type RevisionDiff,
  type StoredRevisionRef,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";
import { enqueueOutbox } from "./outbox.js";

/**
 * Booking persistence for ingestion (spec 04 §4.4): one transaction writes the
 * immutable revision, upserts the projection, rewrites room nights, seals the
 * guest's PII and enqueues the outbox events.
 */
export class DrizzleBookingRepository implements BookingRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}

  async findRevisionBySystemId(systemId: string): Promise<StoredRevisionRef | null> {
    const [r] = await rawRows<{
      id: string;
      channex_revision_id: string;
      booking_id: string;
      property_id: string;
      acked_at: string | null;
      received_at: string;
    }>(
      this.tx,
      sql`select r.id, r.channex_revision_id, r.booking_id, b.property_id, r.acked_at, r.received_at from booking_revision r join booking b on b.id = r.booking_id where r.system_id = ${systemId}`,
    );
    return r
      ? {
          revisionId: r.id,
          channexRevisionId: r.channex_revision_id,
          bookingId: r.booking_id,
          propertyId: r.property_id,
          ackedAt: r.acked_at ? new Date(r.acked_at).toISOString() : null,
          receivedAt: new Date(r.received_at).toISOString(),
        }
      : null;
  }

  async loadProjection(channexBookingId: string): Promise<BookingProjection | null> {
    const [b] = await this.tx
      .select()
      .from(s.booking)
      .where(eq(s.booking.channexBookingId, channexBookingId))
      .limit(1);
    if (!b) return null;
    const rooms = await this.tx
      .select()
      .from(s.bookingRoom)
      .where(eq(s.bookingRoom.bookingId, b.id));
    const roomDays = await rawRows<{ booking_room_id: string; date: string; amount_minor: number }>(
      this.tx,
      sql`select booking_room_id, date::text, amount_minor from booking_room_day where booking_room_id in (select id from booking_room where booking_id = ${b.id})`,
    );
    const guestRow = b.guestId
      ? (await this.tx.select().from(s.guest).where(eq(s.guest.id, b.guestId)).limit(1))[0]
      : undefined;
    return {
      bookingId: b.id,
      channexBookingId: b.channexBookingId,
      propertyId: b.propertyId,
      status: b.status as BookingProjection["status"],
      arrivalDate: b.arrivalDate,
      departureDate: b.departureDate,
      currency: b.currency,
      totalAmountMinor: b.totalAmountMinor,
      otaCommissionMinor: b.otaCommissionMinor,
      otaName: b.otaName ?? "",
      otaReservationCode: b.otaReservationCode ?? "",
      mappingState: b.mappingState as BookingProjection["mappingState"],
      rooms: rooms.map((r) => ({
        roomTypeId: r.roomTypeId,
        ratePlanId: r.ratePlanId,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        days: Object.fromEntries(
          roomDays
            .filter((d) => d.booking_room_id === r.id)
            .map((d) => [d.date, Number(d.amount_minor)]),
        ),
        occupancy: r.occupancy,
        guests: r.guestNames,
      })),
      customer: guestRow
        ? {
            name: await this.crypto.open(guestRow.nameEnc),
            surname: await this.crypto.open(guestRow.surnameEnc),
          }
        : { name: "", surname: "" },
      lastInsertedAt: b.lastRevisionInsertedAt ?? "",
      lastSystemId: b.lastSystemId ?? "",
      lastRevisionId: b.lastRevisionId ?? "",
    };
  }

  async applyRevision(input: {
    revision: BookingRevisionPayload;
    projection: BookingProjection | null;
    diff: RevisionDiff | null;
    events: Array<Omit<DomainEvent, "id">>;
    now: string;
  }): Promise<{ revisionId: string }> {
    const rev = input.revision;
    let bookingId = input.projection?.bookingId;
    if (!bookingId) {
      const [existing] = await this.tx
        .select({ id: s.booking.id })
        .from(s.booking)
        .where(eq(s.booking.channexBookingId, rev.bookingId))
        .limit(1);
      bookingId = existing?.id ?? Id.next();
    }
    if (input.projection) {
      const p = input.projection;
      const guestId = await this.upsertGuest(rev);
      await this.tx
        .insert(s.booking)
        .values({
          id: bookingId,
          orgId: this.orgId,
          propertyId: p.propertyId,
          channexBookingId: p.channexBookingId,
          otaReservationCode: p.otaReservationCode,
          otaName: p.otaName,
          status: p.status,
          arrivalDate: p.arrivalDate,
          departureDate: p.departureDate,
          currency: p.currency,
          totalAmountMinor: p.totalAmountMinor,
          otaCommissionMinor: p.otaCommissionMinor,
          guestId,
          mappingState: p.mappingState,
          lastRevisionId: rev.revisionId,
          lastRevisionInsertedAt: p.lastInsertedAt,
          lastSystemId: p.lastSystemId,
        })
        .onConflictDoUpdate({
          target: s.booking.channexBookingId,
          set: {
            status: p.status,
            arrivalDate: p.arrivalDate,
            departureDate: p.departureDate,
            currency: p.currency,
            totalAmountMinor: p.totalAmountMinor,
            otaCommissionMinor: p.otaCommissionMinor,
            guestId,
            mappingState: p.mappingState,
            lastRevisionId: rev.revisionId,
            lastRevisionInsertedAt: p.lastInsertedAt,
            lastSystemId: p.lastSystemId,
            updatedAt: sql`now()`,
          },
        });
      // rewrite rooms and nights from the projection (cancelled bookings keep rows with status cancelled for reporting, BK-6)
      await this.tx.execute(
        sql`delete from booking_room_day where booking_room_id in (select id from booking_room where booking_id = ${bookingId})`,
      );
      await this.tx.delete(s.bookingRoom).where(eq(s.bookingRoom.bookingId, bookingId));
      for (const room of p.rooms) {
        const roomId = Id.next();
        await this.tx.insert(s.bookingRoom).values({
          id: roomId,
          orgId: this.orgId,
          bookingId,
          roomTypeId: room.roomTypeId,
          ratePlanId: room.ratePlanId,
          checkinDate: room.checkinDate,
          checkoutDate: room.checkoutDate,
          occupancy: room.occupancy,
          guestNames: room.guests,
          amountMinor: Object.values(room.days).reduce((a, b) => a + b, 0),
        });
        const days = Object.entries(room.days);
        if (days.length > 0) {
          await this.tx.insert(s.bookingRoomDay).values(
            days.map(([date, amount]) => ({
              orgId: this.orgId,
              bookingRoomId: roomId,
              propertyId: p.propertyId,
              roomTypeId: room.roomTypeId,
              date,
              amountMinor: amount,
              status: p.status === "cancelled" ? "cancelled" : "confirmed",
            })),
          );
        }
      }
      if (rev.guarantee) {
        await this.tx.insert(s.paymentInstrument).values({
          id: Id.next(),
          orgId: this.orgId,
          bookingId,
          type: "card",
          cardType: rev.guarantee.cardType,
          maskedNumber: rev.guarantee.maskedNumber,
          expiry: rev.guarantee.expiry,
          cardholder: rev.guarantee.cardholder,
        });
      }
    }
    const revisionId = Id.next();
    await this.tx.insert(s.bookingRevision).values({
      id: revisionId,
      orgId: this.orgId,
      bookingId,
      channexRevisionId: rev.revisionId,
      systemId: rev.systemId,
      revisionType: rev.status,
      rawPayload: rev.raw,
      normalised: { ...rev, raw: undefined },
      diffFromPrevious: input.diff,
      insertedAt: rev.insertedAt,
      receivedAt: input.now,
      appliedAt: input.projection ? input.now : null,
    });
    for (const e of input.events) await enqueueOutbox(this.tx, e);
    return { revisionId };
  }

  async markAcked(channexRevisionIds: string[], at: string): Promise<void> {
    for (const id of channexRevisionIds) {
      await this.tx
        .update(s.bookingRevision)
        .set({ ackedAt: at })
        .where(eq(s.bookingRevision.channexRevisionId, id));
      await this.tx.execute(
        sql`update booking set acked_at = ${at} where id = (select booking_id from booking_revision where channex_revision_id = ${id})`,
      );
    }
  }

  async listUnacked(before: string): Promise<StoredRevisionRef[]> {
    const rows = await rawRows<{
      id: string;
      channex_revision_id: string;
      booking_id: string;
      property_id: string;
      received_at: string;
    }>(
      this.tx,
      sql`select r.id, r.channex_revision_id, r.booking_id, b.property_id, r.received_at from booking_revision r join booking b on b.id = r.booking_id where r.acked_at is null and r.received_at <= ${before} order by r.received_at`,
    );
    return rows.map((r) => ({
      revisionId: r.id,
      channexRevisionId: r.channex_revision_id,
      bookingId: r.booking_id,
      propertyId: r.property_id,
      ackedAt: null,
      receivedAt: new Date(r.received_at).toISOString(),
    }));
  }

  /** Guests are deduplicated per org by an email+phone hash; PII columns are sealed (spec 03 §3.5). */
  private async upsertGuest(rev: BookingRevisionPayload): Promise<string> {
    const c = rev.customer;
    const dedupeHash = this.crypto.sha256Hex(
      `${(c.email ?? "").toLowerCase()}|${(c.phone ?? "").replace(/\D/g, "")}|${c.surname.toLowerCase()}`,
    );
    const [existing] = await this.tx
      .select({ id: s.guest.id })
      .from(s.guest)
      .where(eq(s.guest.dedupeHash, dedupeHash))
      .limit(1);
    if (existing) return existing.id;
    const id = Id.next();
    await this.tx.insert(s.guest).values({
      id,
      orgId: this.orgId,
      propertyId: rev.propertyId,
      nameEnc: await this.crypto.seal(c.name),
      surnameEnc: await this.crypto.seal(c.surname),
      emailEnc: c.email ? await this.crypto.seal(c.email) : null,
      phoneEnc: c.phone ? await this.crypto.seal(c.phone) : null,
      country: c.country ?? null,
      language: c.language ?? null,
      dedupeHash,
    });
    return id;
  }
}

/** Booked room-nights per (room type, date) for availability derivation (spec 05 §5.4.2). */
export async function bookedNightsByRoomType(
  tx: Tx,
  propertyId: string,
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, number>> {
  const rows = await rawRows<{ room_type_id: string; date: string; n: number }>(
    tx,
    sql`
    select room_type_id, date::text, count(*)::int as n from booking_room_day
    where property_id = ${propertyId} and status = 'confirmed' and room_type_id is not null and date between ${dateFrom} and ${dateTo}
    group by room_type_id, date`,
  );
  return new Map(rows.map((r) => [`${r.room_type_id}|${r.date}`, r.n]));
}
