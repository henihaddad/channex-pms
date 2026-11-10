import {
  cancellationFee,
  checkSellable,
  directBookingChange,
  directBookingRevision,
  Id,
  spreadTotal,
  type BookingRevisionPayload,
} from "@pms/core";
import {
  DrizzleAriStore,
  DrizzleBillingRepository,
  DrizzleOperationsRepository,
  DrizzlePropertyRepository,
  DrizzleReservationRepository,
  rawRows,
  sql,
} from "@pms/db";
import { applyDirectRevision } from "@pms/jobs";
import type { ActorCtx } from "./with-permission";
import { container } from "./container";
import { HttpProblem } from "./errors";

/** Bookings this system owns end to end; OTA bookings are modified at the OTA (spec 08 §8.4). */
export const DIRECT_SOURCES = ["direct", "staff", "phone", "walk_in"];

/** The sellability check and price the staff form shows before saving; the same check the create runs. */
export async function staffCheck(
  ctx: ActorCtx,
  i: {
    propertyId: string;
    roomTypeId: string;
    ratePlanId: string;
    arrivalDate: string;
    departureDate: string;
  },
) {
  const rateCells = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).rateCells(
    i.ratePlanId,
    i.arrivalDate,
    i.departureDate,
  );
  const avail = await new DrizzleAriStore(ctx.tx).loadDesired(
    i.propertyId,
    i.arrivalDate,
    i.departureDate,
  );
  const check = checkSellable({
    arrivalDate: i.arrivalDate,
    departureDate: i.departureDate,
    rateCells,
    availability: new Map(
      avail.availability
        .filter((a) => a.roomTypeId === i.roomTypeId)
        .map((a) => [a.date, a.availability]),
    ),
  });
  const [prop] = await rawRows<{ currency: string }>(
    ctx.tx,
    sql`select currency from property where id = ${i.propertyId}`,
  );
  const first = rateCells.find((c) => c.date === i.arrivalDate)?.values;
  const longest = Math.max(first?.minStayArrival ?? 0, first?.minStay ?? 0);
  const minStay = longest > 1 ? longest : null;
  return { check, currency: prop?.currency ?? "EUR", minStay };
}

/** One apply path for staff, phone, walk-in and direct bookings (spec 08 §8.11); the engine uses the same function. */
export async function applyDirect(ctx: ActorCtx, rev: BookingRevisionPayload): Promise<string> {
  const c = await container();
  return applyDirectRevision(c, ctx.tx, ctx.orgId, rev, "direct_booking");
}

export interface StaffBookingInput {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  /** First night and check-out day: a half-open stay (rule 5). */
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  guest: { name: string; surname: string };
  email?: string | undefined;
  phone?: string | undefined;
  language?: string | undefined;
  /** A total typed over the rate plan's price, in minor units; null keeps the plan's price. */
  totalMinor: number | null;
  /** Money already received at booking: recorded on the folio as a payment. */
  payment: "later" | "card" | "cash" | "bank_transfer";
  note?: string | undefined;
  source: "staff" | "phone" | "walk_in" | "direct";
}

/**
 * A staff, phone, walk-in or API booking (spec 08 §8.11): checked against local availability
 * and restrictions, priced from the rate plan unless a total is given, applied through the
 * one direct-booking path, and pushed to the channels by the worker.
 */
export async function createStaffBooking(
  ctx: ActorCtx,
  input: StaffBookingInput,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string; reasons: string[] }> {
  const c = await container();
  const { check, currency } = await staffCheck(ctx, input);
  const priced =
    input.totalMinor !== null && check.ok
      ? {
          ...check,
          nightly: spreadTotal(check.nightly, input.totalMinor),
          totalMinor: input.totalMinor,
        }
      : check;
  const rev = directBookingRevision(
    {
      bookingId: Id.next(),
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      currency,
      occupancy: { adults: input.adults, children: input.children, infants: 0 },
      customer: {
        ...input.guest,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.language ? { language: input.language } : {}),
      },
      source: input.source,
      nowIso: c.clock.now().toString(),
    },
    priced,
  );
  if (!rev.ok) return { ok: false, error: rev.error.message, reasons: check.reasons };
  const id = await applyDirect(ctx, rev.value);
  if (input.payment !== "later") {
    const billing = new DrizzleBillingRepository(ctx.tx, ctx.orgId);
    await billing.addPayment(
      await billing.ensureFolio(id),
      { method: input.payment, amountMinor: priced.totalMinor, state: "captured" },
      ctx.userId,
    );
  }
  if (input.note?.trim())
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).addNote({
      subjectType: "booking",
      subjectId: id,
      body: input.note.trim(),
      authorId: ctx.userId,
    });
  return { ok: true, bookingId: id };
}

/** A direct booking cancels here with the policy fee; an OTA booking is cancelled at the OTA. */
export async function cancelDirectBooking(
  ctx: ActorCtx,
  bookingId: string,
  propertyId: string,
): Promise<{ cancellationFeeMinor: number; currency: string }> {
  const c = await container();
  const d = await new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).detail(bookingId);
  if (!d || d.propertyId !== propertyId)
    throw new HttpProblem(404, "not_found", "Reservation not found in this property");
  if (!DIRECT_SOURCES.includes(d.otaName ?? ""))
    throw new HttpProblem(
      409,
      "ota_booking",
      "OTA bookings are modified at the OTA",
      `Cancel ${d.otaName ?? "this booking"} on the channel; the cancellation comes back here on its own`,
    );
  if (d.status === "cancelled")
    throw new HttpProblem(409, "already_cancelled", "This reservation is already cancelled");
  const last = await rawRows<{ normalised: BookingRevisionPayload; n: number }>(
    ctx.tx,
    sql`select normalised, (select count(*)::int from booking_revision where booking_id = ${bookingId}) as n from booking_revision where booking_id = ${bookingId} order by inserted_at desc limit 1`,
  );
  const prev = last[0]!.normalised;
  const cancel = directBookingChange(
    { ...prev, raw: {} },
    { status: "cancelled", nowIso: c.clock.now().toString(), sequence: last[0]!.n + 1 },
  );
  await applyDirect(ctx, cancel);
  const today = c.clock.today(d.timezone).toString();
  const fee = cancellationFee(
    { type: "flexible", freeUntilDaysBefore: 3, lateFeePercent: 100 },
    {
      arrivalDate: d.arrivalDate,
      totalMinor: d.totalAmountMinor,
      firstNightMinor: d.rooms[0]?.days[0]?.amountMinor ?? 0,
    },
    today,
  );
  const billing = new DrizzleBillingRepository(ctx.tx, ctx.orgId);
  if (fee > 0)
    await billing.addLine(
      await billing.ensureFolio(bookingId),
      { kind: "cancellation_fee", description: "Cancellation fee", date: today, amountMinor: fee },
      ctx.userId,
    );
  return { cancellationFeeMinor: fee, currency: d.currency };
}
