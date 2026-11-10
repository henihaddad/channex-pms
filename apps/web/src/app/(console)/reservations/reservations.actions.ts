"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  autoAssign,
  cancellationFee,
  checkSellable,
  directBookingChange,
  Id,
  planPayments,
  splitFullName,
  spreadTotal,
  type BookingRevisionPayload,
} from "@pms/core";
import {
  DrizzleAriStore,
  DrizzleBillingRepository,
  DrizzleBookingEngineRepository,
  DrizzleMessagingRepository,
  DrizzleOperationsRepository,
  DrizzlePaymentRuleRepository,
  DrizzlePropertyRepository,
  DrizzleReservationRepository,
  type FolioView,
  type ListPill,
  rawRows,
  type ReservationDetail,
  type ReservationFilters,
  type ReservationRow,
  sql,
  type TaskRow,
} from "@pms/db";
import { issueCredential, recomputeAvailability } from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import {
  applyDirect,
  cancelDirectBooking,
  createStaffBooking,
  DIRECT_SOURCES,
  staffCheck,
} from "@/server/reservations";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

/** Property scope comes from the form (no database round trip before the transaction); the handler verifies the booking belongs to it. */
const bookingScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
async function assertBookingInProperty(ctx: ActorCtx, fd: FormData): Promise<string> {
  const bookingId = String(fd.get("bookingId"));
  const [b] = await rawRows<{ property_id: string }>(
    ctx.tx,
    sql`select property_id from booking where id = ${bookingId}`,
  );
  if (!b || b.property_id !== String(fd.get("propertyId")))
    throw new HttpProblem(404, "not_found", "Reservation not found in this property");
  return bookingId;
}
const reservations = (ctx: ActorCtx, c: Awaited<ReturnType<typeof container>>) =>
  new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto);

export const listReservations = withPermission<
  [ReservationFilters],
  {
    rows: ReservationRow[];
    total: number;
    /** The list's filter pills and how many bookings each holds. */
    pills: Record<ListPill, number>;
    /** Property-local today, for "arrives in 11 days". */
    today: string;
    views: Array<{ id: string; name: string; filters: Record<string, unknown> }>;
  }
>("booking:read", { scope: "organization", audit: false }, async (ctx, filters) => {
  const c = await container();
  const repo = reservations(ctx, c);
  const today = await portfolioToday(ctx);
  return {
    ...(await repo.list(filters, today)),
    pills: await repo.pillCounts(today),
    today,
    views: await repo.savedViews(ctx.userId, "reservations"),
  };
});

/** "Today" is a property-local date (spec 08): the portfolio takes its oldest property's zone. */
async function portfolioToday(ctx: ActorCtx): Promise<string> {
  const c = await container();
  const [tz] = await rawRows<{ timezone: string }>(
    ctx.tx,
    sql`select timezone from property where archived_at is null order by created_at limit 1`,
  );
  return c.clock.today(tz?.timezone ?? "UTC").toString();
}

export const saveViewAction = withPermission<[FormData], void>(
  "booking:read",
  { scope: "organization", subject: (fd) => ({ kind: "saved_view", id: String(fd.get("name")) }) },
  async (ctx, fd) => {
    const c = await container();
    await reservations(ctx, c).saveView(
      Id.next(),
      ctx.userId,
      "reservations",
      String(fd.get("name")),
      JSON.parse(String(fd.get("filters") || "{}")) as Record<string, unknown>,
    );
    revalidatePath("/reservations");
  },
);

export interface ReservationView {
  detail: ReservationDetail;
  tasks: TaskRow[];
  credentials: Awaited<ReturnType<DrizzleOperationsRepository["activeCredentials"]>>;
  folios: FolioView[];
  notes: Awaited<ReturnType<DrizzleOperationsRepository["notesFor"]>>;
  units: Awaited<ReturnType<DrizzleOperationsRepository["unitIds"]>>;
  /** The property-local date. */
  today: string;
}

export const loadReservation = withPermission<[string], ReservationView>(
  "booking:read",
  { scope: "organization", audit: false },
  async (ctx, id) => {
    const c = await container();
    const detail = await reservations(ctx, c).detail(id);
    if (!detail) throw new HttpProblem(404, "not_found", "Reservation not found");
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    return {
      detail,
      tasks: await ops.tasksForBooking(id),
      credentials: await ops.activeCredentials(id),
      folios: await new DrizzleBillingRepository(ctx.tx, ctx.orgId).foliosForBooking(id),
      notes: await ops.notesFor("booking", id),
      units: await ops.unitIds(detail.propertyId),
      today: c.clock.today(detail.timezone).toString(),
    };
  },
);

/** Guest PII: permission-checked and audited per view (spec 08 §8.2). */
export const revealGuestPii = withPermission<
  [{ bookingId: string; guestId: string }],
  { name: string; surname: string; email: string | null; phone: string | null } | null
>(
  "booking:read_pii",
  { scope: "organization", subject: (i) => ({ kind: "guest", id: i.guestId }) },
  async (ctx, { guestId }) => {
    const c = await container();
    return reservations(ctx, c).guestPii(guestId);
  },
);

export interface BookingConversation {
  threadId: string;
  propertyId: string;
  channel: string;
  messages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    author: string | null;
    body: string;
    sentAt: string;
  }>;
}

/** The booking's thread on its detail page (spec 08 §8.2 Messages): the last few messages, read under `message:read` and audited; it does not mark the thread read. */
export const loadBookingConversation = withPermission<[string], BookingConversation | null>(
  "message:read",
  { scope: "organization", subject: (id) => ({ kind: "booking", id }) },
  async (ctx, bookingId) => {
    const c = await container();
    const repo = new DrizzleMessagingRepository(ctx.tx, ctx.orgId, c.crypto);
    const thread = await repo.threadForBooking(bookingId);
    if (!thread) return null;
    const d = await repo.detail(thread.id, c.clock.now().toString());
    if (!d) return null;
    return {
      threadId: d.id,
      propertyId: d.propertyId,
      channel: d.provider,
      messages: d.messages
        .filter((m) => m.kind === "guest_message" && m.authorType !== "system")
        .slice(-4)
        .map((m) => ({
          id: m.id,
          direction: m.direction === "inbound" ? "inbound" : "outbound",
          author: m.authorName,
          body: m.body,
          sentAt: m.sentAt,
        })),
    };
  },
);

/**
 * Open the guest portal as the guest (shortcut O): the mailed link is stored only as a hash, so
 * staff get a fresh one-hour session for this booking. Under `booking:read_pii`, audited.
 */
export const openGuestPortalAction = withPermission<[{ bookingId: string }], { url: string }>(
  "booking:read_pii",
  { scope: "organization", subject: (i) => ({ kind: "booking", id: i.bookingId }) },
  async (ctx, { bookingId }) => {
    const c = await container();
    const [b] = await rawRows<{ id: string }>(
      ctx.tx,
      sql`select id from booking where id = ${bookingId}`,
    );
    if (!b) throw new HttpProblem(404, "not_found", "Reservation not found");
    const token = c.crypto.randomToken(32);
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).createGuestSession(
      bookingId,
      c.crypto.sha256Hex(token),
      new Date(Date.parse(c.clock.now().toString()) + 3_600_000).toISOString(),
    );
    return { url: `/guest?token=${token}` };
  },
);

/** Payment instrument metadata: step-up gated, audited per view (PCI-5). */
export const revealInstrument = withPermission<
  [{ bookingId: string }],
  ReservationDetail["instruments"]
>(
  "booking:read_payment_instrument",
  { scope: "organization", subject: (i) => ({ kind: "booking", id: i.bookingId }) },
  async (ctx, { bookingId }) => {
    const c = await container();
    return (await reservations(ctx, c).detail(bookingId))?.instruments ?? [];
  },
);

export const acknowledgeAction = withPermission<[FormData], void>(
  "booking:read",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    await reservations(ctx, c).acknowledge(
      String(fd.get("bookingId")),
      String(fd.get("revisionId")),
      ctx.userId,
    );
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

export const addNoteAction = withPermission<[FormData], void>(
  "note:create",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }),
  },
  async (ctx, fd) => {
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).addNote({
      subjectType: "booking",
      subjectId: String(fd.get("bookingId")),
      body: String(fd.get("body")),
      authorId: ctx.userId,
      pinned: fd.get("pinned") === "on",
    });
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

/** Assign or move a unit; tasks re-plan for the property (spec 08 §8.4). */
export const assignUnitAction = withPermission<[FormData], void>(
  "booking:assign_unit",
  {
    ...bookingScope,
    subject: (fd) => ({ kind: "booking_room", id: String(fd.get("bookingRoomId")) }),
  },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    const bookingId = String(fd.get("bookingId"));
    const unitId = String(fd.get("unitId") || "") || null;
    await reservations(ctx, c).assignUnit(String(fd.get("bookingRoomId")), unitId);
    await replanFor(ctx, bookingId);
    revalidatePath(`/reservations/${bookingId}`);
  },
);

export const autoAssignAction = withPermission<[FormData], void>(
  "booking:assign_unit",
  { ...bookingScope, subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    const bookingId = String(fd.get("bookingId"));
    const d = (await reservations(ctx, c).detail(bookingId))!;
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const units = await ops.unitIds(d.propertyId);
    const busy = await rawRows<{ unit_id: string; from: string; to: string; booking_id: string }>(
      ctx.tx,
      sql`select br.assigned_unit_id as unit_id, br.checkin_date::text as "from", br.checkout_date::text as "to", br.booking_id from booking_room br join booking b on b.id = br.booking_id where b.property_id = ${d.propertyId} and b.status <> 'cancelled' and br.assigned_unit_id is not null`,
    );
    const suggestions = autoAssign(
      d.rooms
        .filter((r) => r.roomTypeId)
        .map((r) => ({
          bookingId,
          bookingRoomId: r.id,
          roomTypeId: r.roomTypeId!,
          checkinDate: r.checkinDate,
          checkoutDate: r.checkoutDate,
          currentUnitId: r.assignedUnitId,
        })),
      units.map((u) => ({
        id: u.id,
        roomTypeId: u.roomTypeId,
        attributes: u.attributes,
        status: u.status,
        busy: busy
          .filter((b) => b.unit_id === u.id)
          .map((b) => ({ from: b.from, to: b.to, bookingId: b.booking_id })),
      })),
    );
    for (const s of suggestions)
      if (s.unitId) await reservations(ctx, c).assignUnit(s.bookingRoomId, s.unitId);
    for (const w of suggestions.flatMap((s) => s.warnings))
      await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).addNote({
        subjectType: "booking",
        subjectId: bookingId,
        body: `Auto-assign: ${w}`,
        authorId: ctx.userId,
      });
    await replanFor(ctx, bookingId);
    revalidatePath(`/reservations/${bookingId}`);
  },
);

async function replanFor(ctx: ActorCtx, bookingId: string): Promise<void> {
  const c = await container();
  const [b] = await rawRows<{ property_id: string; timezone: string }>(
    ctx.tx,
    sql`select b.property_id, p.timezone from booking b join property p on p.id = b.property_id where b.id = ${bookingId}`,
  );
  if (!b) return;
  const today = c.clock.today(b.timezone);
  await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).replan(
    b.property_id,
    today.minusDays(1).toString(),
    today.plusDays(400).toString(),
  );
}

export const issueCredentialAction = withPermission<
  [FormData],
  { value: string; validFrom: string; validTo: string }
>(
  "access_credential:issue",
  { ...bookingScope, subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    const bookingId = String(fd.get("bookingId"));
    const d = (await reservations(ctx, c).detail(bookingId))!;
    const unitId =
      d.rooms[0]?.assignedUnitId ??
      (await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).unitIds(d.propertyId))[0]?.id ??
      null;
    const r = await issueCredential(
      { db: c.db.db, clock: c.clock, crypto: c.crypto, lock: c.lock, log: ctx.log },
      ctx.tx,
      ctx.orgId,
      {
        propertyId: d.propertyId,
        bookingId,
        unitId,
        type: String(fd.get("type") || "door_code") as
          "door_code" | "lockbox" | "smart_lock" | "key_handover",
        timezone: d.timezone,
        arrivalDate: d.arrivalDate,
        departureDate: d.departureDate,
        issuedBy: ctx.userId,
      },
    );
    revalidatePath(`/reservations/${bookingId}`);
    return { value: r.value, validFrom: r.validFrom, validTo: r.validTo };
  },
);

export const revokeCredentialAction = withPermission<[FormData], void>(
  "access_credential:revoke",
  {
    ...bookingScope,
    subject: (fd) => ({ kind: "access_credential", id: String(fd.get("credentialId")) }),
  },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const cred = (await ops.activeCredentials(String(fd.get("bookingId")))).find(
      (x) => x.id === String(fd.get("credentialId")),
    );
    if (cred) await c.lock.revoke({ unitRef: cred.unitId ?? "", providerRef: cred.providerRef });
    await ops.revokeCredential(
      String(fd.get("credentialId")),
      String(fd.get("reason") || "revoked by staff"),
    );
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

/** Reveal a code: audited per view, never logged (spec 08 §8.2). */
export const revealCredential = withPermission<
  [{ bookingId: string; credentialId: string }],
  string | null
>(
  "access_credential:read",
  { scope: "organization", subject: (i) => ({ kind: "access_credential", id: i.credentialId }) },
  async (ctx, { credentialId }) => {
    const c = await container();
    const sealed = await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).credentialSecret(
      credentialId,
    );
    return sealed ? c.crypto.open(sealed) : null;
  },
);

export const stayStateAction = withPermission<[FormData], void>(
  "booking:check_in_out",
  {
    ...bookingScope,
    subject: (fd) => ({ kind: "booking_room", id: String(fd.get("bookingRoomId")) }),
  },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    const state = String(fd.get("state")) as "checked_in" | "checked_out" | "no_show";
    const bookingId = String(fd.get("bookingId"));
    await reservations(ctx, c).setStayState(
      String(fd.get("bookingRoomId")),
      state,
      ctx.userId,
      String(fd.get("reason") || "") || undefined,
    );
    const d = (await reservations(ctx, c).detail(bookingId))!;
    const room = d.rooms.find((r) => r.id === String(fd.get("bookingRoomId")));
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    if (state === "checked_out" && room?.assignedUnitId)
      await ops.setUnitStatus(room.assignedUnitId, "dirty");
    if (state === "no_show") {
      const fee = cancellationFee(
        { type: "first_night" },
        {
          arrivalDate: d.arrivalDate,
          totalMinor: d.totalAmountMinor,
          firstNightMinor: room?.days[0]?.amountMinor ?? 0,
        },
        c.clock.today(d.timezone).toString(),
      );
      const billing = new DrizzleBillingRepository(ctx.tx, ctx.orgId);
      if (fee > 0)
        await billing.addLine(
          await billing.ensureFolio(bookingId),
          {
            kind: "no_show_fee",
            description: "No-show fee",
            date: d.arrivalDate,
            amountMinor: fee,
          },
          ctx.userId,
        );
      if (room?.roomTypeId)
        await recomputeAvailability(
          ctx.tx,
          ctx.orgId,
          d.propertyId,
          room.roomTypeId,
          room.checkinDate,
          room.checkoutDate,
          Date.now(),
          "no_show",
        );
    }
    revalidatePath(`/reservations/${bookingId}`);
  },
);

// ---- folios (spec 08 §8.9) --------------------------------------------------------------

export const addChargeAction = withPermission<[FormData], void>(
  "charge:create",
  { ...bookingScope, subject: (fd) => ({ kind: "folio", id: String(fd.get("folioId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const amount = Math.round(Number(fd.get("amount")) * 100);
    if (!Number.isFinite(amount)) throw new HttpProblem(422, "invalid", "amount must be a number");
    await new DrizzleBillingRepository(ctx.tx, ctx.orgId).addLine(
      String(fd.get("folioId")),
      {
        kind: String(fd.get("kind") || "extra") as never,
        description: String(fd.get("description")),
        date: String(fd.get("date")),
        amountMinor: amount,
      },
      ctx.userId,
    );
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

export const addPaymentAction = withPermission<[FormData], void>(
  "payment:capture",
  { ...bookingScope, subject: (fd) => ({ kind: "folio", id: String(fd.get("folioId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const amount = Math.round(Number(fd.get("amount")) * 100);
    await new DrizzleBillingRepository(ctx.tx, ctx.orgId).addPayment(
      String(fd.get("folioId")),
      {
        method: String(fd.get("method") || "card") as never,
        amountMinor: amount,
        state: fd.get("hold") === "on" ? "held" : "captured",
      },
      ctx.userId,
    );
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

/** Refunds and deposit settlement need step-up and a reason (spec 08 §8.9). */
export const settlePaymentAction = withPermission<[FormData], void>(
  "payment:refund",
  {
    ...bookingScope,
    stepUp: true,
    subject: (fd) => ({ kind: "payment", id: String(fd.get("paymentId")) }),
  },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const reason = String(fd.get("reason") || "").trim();
    if (!reason) throw new HttpProblem(422, "reason_required", "a reason is required");
    await new DrizzleBillingRepository(ctx.tx, ctx.orgId).setPaymentState(
      String(fd.get("paymentId")),
      String(fd.get("state")) as never,
      reason,
    );
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

export const issueInvoiceAction = withPermission<[FormData], void>(
  "invoice:issue",
  { ...bookingScope, subject: (fd) => ({ kind: "folio", id: String(fd.get("folioId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    await new DrizzleBillingRepository(ctx.tx, ctx.orgId).issueInvoice(String(fd.get("folioId")), {
      year: Number(c.clock.today("UTC").toString().slice(0, 4)),
      issuedBy: ctx.userId,
      kind: String(fd.get("kind") || "invoice") as never,
    });
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

export const splitFolioAction = withPermission<[FormData], void>(
  "folio:update",
  { ...bookingScope, subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const billing = new DrizzleBillingRepository(ctx.tx, ctx.orgId);
    const id = await billing.splitFolio(
      String(fd.get("bookingId")),
      String(fd.get("label") || "Split"),
    );
    for (const lineId of fd.getAll("lineId").map(String)) await billing.transferLine(lineId, id);
    revalidatePath(`/reservations/${String(fd.get("bookingId"))}`);
  },
);

// ---- mapping resolution queue (spec 08 §8.5) ----------------------------------------------

export const loadUnmappedQueue = withPermission<
  [],
  Awaited<ReturnType<DrizzleReservationRepository["unmappedQueue"]>>
>("booking:read", { scope: "organization", audit: false }, async (ctx) => {
  const c = await container();
  return reservations(ctx, c).unmappedQueue();
});

export const resolveUnmappedAction = withPermission<[FormData], void>(
  "booking:resolve_unmapped",
  { ...bookingScope, subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }) },
  async (ctx, fd) => {
    await assertBookingInProperty(ctx, fd);
    const c = await container();
    const bookingId = String(fd.get("bookingId"));
    const roomTypeId = String(fd.get("roomTypeId"));
    await reservations(ctx, c).resolveMapping(bookingId, roomTypeId, String(fd.get("ratePlanId")));
    const d = (await reservations(ctx, c).detail(bookingId))!;
    await recomputeAvailability(
      ctx.tx,
      ctx.orgId,
      d.propertyId,
      roomTypeId,
      d.arrivalDate,
      d.departureDate,
      Date.now(),
      "unmapped_resolved",
    );
    await replanFor(ctx, bookingId);
    revalidatePath("/reservations/unmapped");
  },
);

// ---- staff bookings and direct changes: one booking path (spec 08 §8.11) --------------------

const staffSchema = z.object({
  propertyId: z.string(),
  roomTypeId: z.string(),
  ratePlanId: z.string(),
  arrivalDate: z.string(),
  departureDate: z.string(),
  adults: z.coerce.number().int().min(1),
  children: z.coerce.number().int().min(0).default(0),
  /** One box on the form; split server-side (core `splitFullName`). */
  fullName: z.string().optional(),
  name: z.string().optional(),
  surname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  language: z.string().optional(),
  /** A total typed over the rate plan's price, in major units ("375.00"). */
  total: z.string().optional(),
  /** Money already received at booking: recorded on the folio as a payment. */
  payment: z.enum(["later", "card", "cash", "bank_transfer"]).default("later"),
  note: z.string().optional(),
  source: z.enum(["staff", "phone", "walk_in", "direct"]).default("staff"),
});

export interface StaffBookingState {
  error?: string;
  bookingId?: string;
  reasons?: string[];
}

export interface StaffQuote {
  ok: boolean;
  reasons: string[];
  currency: string;
  nights: number;
  totalMinor: number;
  nightly: Array<{ date: string; amountMinor: number }>;
  /** The longest minimum stay that applies on arrival, when one does. */
  minStay: number | null;
  /** What the payment rules ask for at booking (spec 10 §10.4), when they ask for anything. */
  dueNow: { name: string; amountMinor: number } | null;
}

export const quoteStaffBookingAction = withPermission<
  [
    {
      propertyId: string;
      roomTypeId: string;
      ratePlanId: string;
      arrivalDate: string;
      departureDate: string;
      totalMinor?: number;
    },
  ],
  StaffQuote
>(
  "booking:create",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, i) => {
    const c = await container();
    const { check, currency, minStay } = await staffCheck(ctx, i);
    const nightly =
      i.totalMinor !== undefined && check.ok
        ? spreadTotal(check.nightly, i.totalMinor)
        : check.nightly;
    const totalMinor = Object.values(nightly).reduce((a, b) => a + b, 0);
    const today = c.clock.today("UTC").toString();
    const due = planPayments({
      rules: await new DrizzlePaymentRuleRepository(ctx.tx, ctx.orgId).listRules(),
      totalMinor,
      currency,
      propertyId: i.propertyId,
      channel: "direct",
      arrival: i.arrivalDate,
      bookedOn: today,
    }).filter((x) => x.dueOn <= today);
    return {
      ok: check.ok,
      reasons: check.reasons,
      currency,
      nights: Object.keys(nightly).length,
      totalMinor,
      nightly: Object.entries(nightly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amountMinor]) => ({ date, amountMinor })),
      minStay,
      dueNow:
        due.length > 0
          ? {
              name: due.map((x) => x.name).join(", "),
              amountMinor: due.reduce((a, x) => a + x.amountMinor, 0),
            }
          : null,
    };
  },
);

export const createStaffBookingAction = withPermission<
  [StaffBookingState, FormData],
  StaffBookingState
>(
  "booking:create",
  {
    scope: "property",
    resolveScope: (_p, fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: () => ({ kind: "booking", id: "new" }),
    redact: ["email", "phone", "fullName", "name", "surname", "note"],
  },
  async (ctx, _prev, fd) => {
    const p = staffSchema.safeParse(Object.fromEntries(fd.entries()));
    if (!p.success)
      return { error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const input = p.data;
    const who = input.fullName
      ? splitFullName(input.fullName)
      : input.name && input.surname
        ? { name: input.name, surname: input.surname }
        : null;
    if (!who) return { error: "Write the guest's full name: first name and surname." };
    const totalMinor = input.total?.trim() ? Math.round(Number(input.total) * 100) : null;
    if (totalMinor !== null && (!Number.isFinite(totalMinor) || totalMinor < 0))
      return { error: "The total must be an amount, like 375.00." };
    const r = await createStaffBooking(ctx, {
      ...input,
      guest: who,
      totalMinor,
    });
    if (!r.ok) return { error: r.error, reasons: r.reasons };
    const id = r.bookingId;
    revalidatePath("/reservations");
    return { bookingId: id };
  },
);

export interface ReturningGuest {
  guestId: string;
  name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  country: string | null;
  stays: number;
}

/** "Start typing to find a returning guest": opens sealed names, so `booking:read_pii`, audited. */
export const findReturningGuestsAction = withPermission<[{ q: string }], ReturningGuest[]>(
  "booking:read_pii",
  { scope: "organization", subject: () => ({ kind: "guest", id: "search" }) },
  async (ctx, { q }) => {
    const c = await container();
    return new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).findGuests(q, 6);
  },
);

/**
 * Change the dates of a direct booking (spec 08 §8.4 Modify): the nights it already holds count
 * as free for itself, new nights are priced from the rate plan, kept nights keep their price.
 * OTA bookings are modified at the OTA.
 */
export const changeDatesAction = withPermission<[FormData], void>(
  "booking:modify",
  { ...bookingScope, subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }) },
  async (ctx, fd) => {
    const bookingId = await assertBookingInProperty(ctx, fd);
    const c = await container();
    const d = (await reservations(ctx, c).detail(bookingId))!;
    if (!DIRECT_SOURCES.includes(d.otaName ?? ""))
      throw new HttpProblem(409, "ota_booking", "OTA bookings are modified at the OTA");
    const arrivalDate = String(fd.get("arrivalDate"));
    const departureDate = String(fd.get("departureDate"));
    const room = d.rooms[0];
    if (!room?.roomTypeId || !room.ratePlanId)
      throw new HttpProblem(409, "unmapped", "Give the booking a room first");
    const held = new Set(room.days.map((x) => x.date));
    const avail = await new DrizzleAriStore(ctx.tx).loadDesired(
      d.propertyId,
      arrivalDate,
      departureDate,
    );
    const check = checkSellable({
      arrivalDate,
      departureDate,
      rateCells: await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).rateCells(
        room.ratePlanId,
        arrivalDate,
        departureDate,
      ),
      availability: new Map(
        avail.availability
          .filter((a) => a.roomTypeId === room.roomTypeId)
          .map((a) => [a.date, a.availability + (held.has(a.date) ? 1 : 0)]),
      ),
    });
    if (!check.ok) throw new HttpProblem(422, "not_sellable", check.reasons.join("; "));
    const kept = Object.fromEntries(
      room.days.filter((x) => x.date in check.nightly).map((x) => [x.date, Number(x.amountMinor)]),
    );
    const last = await rawRows<{ normalised: BookingRevisionPayload; n: number }>(
      ctx.tx,
      sql`select normalised, (select count(*)::int from booking_revision where booking_id = ${bookingId}) as n from booking_revision where booking_id = ${bookingId} order by inserted_at desc limit 1`,
    );
    await applyDirect(
      ctx,
      directBookingChange(
        { ...last[0]!.normalised, raw: {} },
        {
          status: "modified",
          arrivalDate,
          departureDate,
          nightly: { ...check.nightly, ...kept },
          nowIso: c.clock.now().toString(),
          sequence: last[0]!.n + 1,
        },
      ),
    );
    revalidatePath(`/reservations/${bookingId}`);
  },
);

/** OTA bookings are modified at the OTA (spec 08 §8.4); direct ones cancel here with the policy fee. */
export const cancelDirectBookingAction = withPermission<[FormData], void>(
  "booking:cancel",
  { ...bookingScope, subject: (fd) => ({ kind: "booking", id: String(fd.get("bookingId")) }) },
  async (ctx, fd) => {
    const bookingId = await assertBookingInProperty(ctx, fd);
    await cancelDirectBooking(ctx, bookingId, String(fd.get("propertyId")));
    revalidatePath(`/reservations/${bookingId}`);
  },
);
