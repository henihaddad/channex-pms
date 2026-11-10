import { z } from "zod";
import { nightEdits, nightRange, splitFullName, type InboxView } from "@pms/core";
import {
  DrizzleChannelRepository,
  DrizzlePropertyRepository,
  DrizzleReservationRepository,
  DrizzleSyncHealthRepository,
  loadGrid,
  rawRows,
  sql,
  SHIPPED_VIEWS,
} from "@pms/db";
import type { ActorCtx } from "../with-permission";
import { container } from "../container";
import { HttpProblem } from "../errors";
import { applyCellEdits } from "../ari";
import { assertThreadInProperty, messaging, providerLabel, queueDelivery } from "../inbox";
import { cancelDirectBooking, createStaffBooking } from "../reservations";
import { op, type Op } from "./op";

// ---- shared bits -------------------------------------------------------------------------

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const id = z.string().min(1).max(64);
const limit = (max: number, dflt: number) => z.coerce.number().int().min(1).max(max).default(dflt);
const byProperty = (i: { propertyId: string }) => ({ kind: "property" as const, id: i.propertyId });
const MAX_CALENDAR_NIGHTS = 62;

/** "Today" is a property-local date (spec 08): the portfolio takes its oldest property's zone. */
async function portfolioToday(ctx: ActorCtx): Promise<string> {
  const c = await container();
  const [tz] = await rawRows<{ timezone: string }>(
    ctx.tx,
    sql`select timezone from property where archived_at is null order by created_at limit 1`,
  );
  return c.clock.today(tz?.timezone ?? "UTC").toString();
}

/** The rate plans a range edit touches: the ones named, else every base plan of the property. */
async function ratePlansFor(ctx: ActorCtx, propertyId: string, named?: string[]) {
  if (named?.length) return named;
  const rows = await rawRows<{ id: string }>(
    ctx.tx,
    sql`select id from rate_plan where property_id = ${propertyId} and parent_rate_plan_id is null and archived_at is null order by title, id`,
  );
  if (rows.length === 0)
    throw new HttpProblem(404, "not_found", "No rate plan in this property", "Check propertyId");
  return rows.map((r) => r.id);
}

/** A range of nights → cell edits → the calendar's one edit path (version check, undo, push). */
async function editNights(
  ctx: ActorCtx,
  i: { propertyId: string; ratePlanIds?: string[]; firstNight: string; lastNight: string },
  values: Parameters<typeof nightEdits>[0]["values"],
) {
  const ratePlanIds = await ratePlansFor(ctx, i.propertyId, i.ratePlanIds);
  const edits = nightEdits({
    ratePlanIds,
    firstNight: i.firstNight,
    lastNight: i.lastNight,
    values,
  });
  if (!edits.ok) throw new HttpProblem(422, edits.error.code, edits.error.message);
  // "manual": what a person (or their assistant) set; a rate import never overwrites it (spec 06 §6.5b)
  const r = await applyCellEdits(ctx, i.propertyId, edits.value, "manual");
  return {
    applied: r.undoId !== null,
    propertyId: i.propertyId,
    ratePlanIds,
    firstNight: i.firstNight,
    lastNight: i.lastNight,
    cells: edits.value.length,
    set: values,
    undoId: r.undoId,
    note: "Saved locally and queued for every connected channel; get_sync_health shows delivery.",
  };
}

const nightsInput = {
  propertyId: id.describe("Property id from list_properties"),
  ratePlanIds: z
    .array(id)
    .max(20)
    .optional()
    .describe("Rate plans to change; omit for every base rate plan of the property"),
  firstNight: day.describe("First night to change, YYYY-MM-DD"),
  lastNight: day.describe("Last night to change (included), YYYY-MM-DD"),
};

// ---- properties and calendar ---------------------------------------------------------------

export const listProperties = op({
  name: "list_properties",
  title: "List properties",
  description:
    "List every property (listing) the host manages, with its currency, time zone, the channels it is live on, and its room types and rate plans. Call this first: the ids it returns are what the other tools take.",
  permission: "property:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({}),
  rest: { method: "GET", path: "/api/v1/properties/inventory" },
  run: async (ctx) => {
    const props = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list();
    const rts = await rawRows<{ id: string; property_id: string; title: string; n: number }>(
      ctx.tx,
      sql`select id, property_id, title, count_of_rooms as n from room_type where archived_at is null order by title, id`,
    );
    const rps = await rawRows<{
      id: string;
      room_type_id: string;
      title: string;
      parent_rate_plan_id: string | null;
    }>(
      ctx.tx,
      sql`select id, room_type_id, title, parent_rate_plan_id from rate_plan where archived_at is null order by title, id`,
    );
    return props.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      state: p.state,
      currency: p.currency,
      timezone: p.timezone,
      city: p.city,
      channels: (p as { channels?: string[] }).channels ?? [],
      roomTypes: rts
        .filter((r) => r.property_id === p.id)
        .map((r) => ({
          id: r.id,
          title: r.title,
          units: r.n,
          ratePlans: rps
            .filter((x) => x.room_type_id === r.id)
            .map((x) => ({ id: x.id, title: x.title, derivedFrom: x.parent_rate_plan_id })),
        })),
    }));
  },
});

export const getCalendar = op({
  name: "get_calendar",
  title: "Read the calendar",
  description: `Read prices, availability and restrictions night by night for a date range (at most ${String(MAX_CALENDAR_NIGHTS)} nights). Prices are integers in minor units of the property's currency (12000 = 120.00). "available" is the number of units still sellable that night; "stopSell": true means the night is closed on every channel.`,
  permission: "ari:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({
    propertyId: id.optional().describe("Only this property; omit for all"),
    firstNight: day.describe("First night, YYYY-MM-DD"),
    lastNight: day.describe("Last night (included), YYYY-MM-DD"),
  }),
  rest: { method: "GET", path: "/api/v1/ari/calendar" },
  run: async (ctx, i) => {
    const range = nightRange(i.firstNight, i.lastNight);
    if (!range.ok) throw new HttpProblem(422, range.error.code, range.error.message);
    if (range.value.nights() > MAX_CALENDAR_NIGHTS)
      throw new HttpProblem(
        422,
        "nights.too_many",
        `At most ${String(MAX_CALENDAR_NIGHTS)} nights per read`,
      );
    const grid = await loadGrid(ctx.tx, {
      dateFrom: i.firstNight,
      dateTo: i.lastNight,
      ...(i.propertyId ? { propertyIds: [i.propertyId] } : {}),
    });
    return {
      firstNight: i.firstNight,
      lastNight: i.lastNight,
      properties: grid.map((p) => ({
        id: p.id,
        title: p.title,
        currency: p.currency,
        roomTypes: p.roomTypes.map((rt) => ({
          id: rt.id,
          title: rt.title,
          available: Object.fromEntries(rt.cells.map(([d, n]) => [d, n])),
          ratePlans: rt.ratePlans.map((rp) => ({
            id: rp.id,
            title: rp.title,
            derivedFrom: rp.parentRatePlanId,
            nights: rp.cells.map(([date, v, sync]) => ({
              date,
              priceMinor: v.rate ?? null,
              ...(v.minStay !== undefined ? { minStay: v.minStay } : {}),
              ...(v.maxStay !== undefined ? { maxStay: v.maxStay } : {}),
              stopSell: v.stopSell ?? false,
              ...(v.closedToArrival ? { closedToArrival: true } : {}),
              ...(v.closedToDeparture ? { closedToDeparture: true } : {}),
              sync,
            })),
          })),
        })),
      })),
    };
  },
});

export const setPrices = op({
  name: "set_prices",
  title: "Set nightly prices",
  description:
    "Set the nightly price for a range of nights, on every channel the property is connected to. The price is an integer in minor units of the property's currency: 12000 means 120.00. Applies immediately; derived rate plans follow their parent.",
  permission: "ari:update_rate",
  scope: "property",
  write: true,
  resolveScope: byProperty,
  subject: byProperty,
  schema: z.object({
    ...nightsInput,
    priceMinor: z.coerce
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .describe("Price per night in minor units (cents): 12000 = 120.00"),
  }),
  rest: { method: "PUT", path: "/api/v1/ari/prices" },
  run: (ctx, i) => editNights(ctx, i, { rate: i.priceMinor }),
});

export const setAvailability = op({
  name: "set_availability",
  title: "Open or close nights",
  description:
    "Open or close a range of nights for sale on every channel (a stop-sell restriction on each rate plan). open=false blocks the nights, for the owner's own stay or maintenance; open=true sells them again. Existing reservations are not touched.",
  permission: "ari:update_restriction",
  scope: "property",
  write: true,
  resolveScope: byProperty,
  subject: byProperty,
  schema: z.object({
    ...nightsInput,
    open: z.boolean().describe("true to sell the nights, false to close them"),
  }),
  rest: { method: "PUT", path: "/api/v1/ari/availability" },
  run: (ctx, i) => editNights(ctx, i, { stopSell: !i.open }),
});

export const setMinStay = op({
  name: "set_min_stay",
  title: "Set minimum stay",
  description:
    "Set the minimum number of nights a stay must have, for stays that include these nights, on every channel. 1 removes the minimum.",
  permission: "ari:update_restriction",
  scope: "property",
  write: true,
  resolveScope: byProperty,
  subject: byProperty,
  schema: z.object({
    ...nightsInput,
    minStay: z.coerce.number().int().min(1).max(365).describe("Minimum nights, 1 to 365"),
  }),
  rest: { method: "PUT", path: "/api/v1/ari/min-stay" },
  run: (ctx, i) => editNights(ctx, i, { minStay: i.minStay }),
});

// ---- reservations --------------------------------------------------------------------------

const VIEWS = Object.keys(SHIPPED_VIEWS) as [string, ...string[]];
const reservationsRepo = async (ctx: ActorCtx) =>
  new DrizzleReservationRepository(ctx.tx, ctx.orgId, (await container()).crypto);

export const listReservations = op({
  name: "list_reservations",
  title: "List or search reservations",
  description:
    "List reservations, newest arrival first. Use a view for the usual questions (arrivals_today, departures_today, in_stay, arriving_this_week, balance_due, cancelled), or filter by property, dates and status, or search by guest name or booking code with q. Amounts are integers in minor units.",
  permission: "booking:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({
    view: z.enum(VIEWS).optional().describe("A ready-made filter"),
    propertyId: id.optional(),
    dateType: z
      .enum(["arrival", "departure", "stay", "booked"])
      .optional()
      .describe("What from/to apply to (default arrival)"),
    from: day.optional(),
    to: day.optional(),
    status: z.enum(["new", "modified", "cancelled", "active"]).optional(),
    q: z.string().max(100).optional().describe("Guest name or booking code"),
    limit: limit(100, 25),
    offset: z.coerce.number().int().min(0).default(0),
  }),
  rest: { method: "GET", path: "/api/v1/reservations" },
  run: async (ctx, i) => {
    const today = await portfolioToday(ctx);
    const repo = await reservationsRepo(ctx);
    let { rows, total } = await repo.list(i, today);
    if (i.q) {
      // guest names are sealed: SQL matches codes and channel guest lists; the lead guest's
      // name is matched here, on the (bounded) decrypted page the list opens anyway
      const needle = i.q.toLowerCase();
      const wider = await repo.list({ ...i, q: undefined, limit: 500, offset: 0 }, today);
      const seen = new Set(rows.map((r) => r.id));
      const byName = wider.rows.filter(
        (r) => !seen.has(r.id) && r.guestFullName.toLowerCase().includes(needle),
      );
      total += byName.length;
      rows = [...rows, ...byName].slice(0, i.limit);
    }
    return {
      today,
      total,
      reservations: rows.map((r) => ({
        id: r.id,
        code: r.otaReservationCode,
        propertyId: r.propertyId,
        property: r.propertyTitle,
        channel: r.otaName,
        status: r.status,
        arrival: r.arrivalDate,
        departure: r.departureDate,
        nights: r.nights,
        guest: r.guestFullName,
        adults: r.adults,
        children: r.children,
        currency: r.currency,
        totalMinor: r.totalAmountMinor,
        balanceMinor: r.balanceMinor,
        unit: r.unitNames,
      })),
    };
  },
});

export const getReservation = op({
  name: "get_reservation",
  title: "Read a reservation",
  description:
    "Read one reservation: guest names, party, room and rate plan, nightly amounts, payment collection, and its history of changes from the channel.",
  permission: "booking:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({ reservationId: id }),
  rest: { method: "GET", path: "/api/v1/reservations/{id}", idKey: "reservationId" },
  run: async (ctx, i) => {
    const d = await (await reservationsRepo(ctx)).detail(i.reservationId);
    if (!d) throw new HttpProblem(404, "not_found", "Reservation not found");
    return {
      id: d.id,
      code: d.otaReservationCode,
      propertyId: d.propertyId,
      property: d.propertyTitle,
      channel: d.otaName,
      status: d.status,
      arrival: d.arrivalDate,
      departure: d.departureDate,
      currency: d.currency,
      totalMinor: d.totalAmountMinor,
      commissionMinor: d.otaCommissionMinor,
      paymentCollect: d.paymentCollect,
      rooms: d.rooms.map((r) => ({
        roomTypeId: r.roomTypeId,
        roomType: r.roomTypeTitle,
        ratePlanId: r.ratePlanId,
        ratePlan: r.ratePlanTitle,
        guests: r.guestNames.map((g) => `${g.name} ${g.surname}`.trim()),
        adults: r.occupancy.adults,
        children: r.occupancy.children,
        unit: r.unitName,
        stayState: r.stayState,
        nights: r.days,
      })),
      history: d.revisions.map((r) => ({
        at: r.insertedAt,
        type: r.revisionType,
        what: r.timelineText,
      })),
    };
  },
});

export const createReservation = op({
  name: "create_reservation",
  title: "Create a direct reservation",
  description:
    "Book a stay directly (a phone or repeat guest, no OTA). Checks availability and restrictions first and blocks the nights on every channel. arrivalDate is the first night, departureDate the check-out day. Price comes from the rate plan unless totalMinor is given. Get roomTypeId and ratePlanId from list_properties.",
  permission: "booking:create",
  scope: "property",
  write: true,
  resolveScope: byProperty,
  subject: () => ({ kind: "booking", id: "new" }),
  redact: ["guestName", "email", "phone", "note"],
  schema: z.object({
    propertyId: id,
    roomTypeId: id,
    ratePlanId: id,
    arrivalDate: day.describe("First night (check-in day), YYYY-MM-DD"),
    departureDate: day.describe("Check-out day, YYYY-MM-DD"),
    adults: z.coerce.number().int().min(1).max(50),
    children: z.coerce.number().int().min(0).max(50).default(0),
    guestName: z.string().trim().min(3).max(200).describe("First name and surname"),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    language: z.string().max(8).optional(),
    totalMinor: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Total for the stay in minor units, overriding the rate plan's price"),
    note: z.string().max(2000).optional().describe("Internal note on the reservation"),
  }),
  rest: { method: "POST", path: "/api/v1/reservations", status: 201 },
  run: async (ctx, i) => {
    const guest = splitFullName(i.guestName);
    if (!guest) throw new HttpProblem(422, "guest_name", "Give the guest's first name and surname");
    const r = await createStaffBooking(ctx, {
      ...i,
      guest,
      totalMinor: i.totalMinor ?? null,
      payment: "later",
      source: "staff",
    });
    if (!r.ok) throw new HttpProblem(422, "not_sellable", r.error, r.reasons.join("; "));
    return { reservationId: r.bookingId, status: "new" };
  },
});

export const cancelReservation = op({
  name: "cancel_reservation",
  title: "Cancel a direct reservation",
  description:
    "Cancel a direct reservation (one created here, by phone or walk-in) and reopen its nights on every channel; the cancellation policy fee, if any, is added to the folio. OTA reservations (Airbnb, Booking.com…) must be cancelled on the OTA; this tool refuses them.",
  permission: "booking:cancel",
  scope: "property",
  write: true,
  destructive: true,
  resolveScope: byProperty,
  subject: (i) => ({ kind: "booking", id: i.reservationId }),
  schema: z.object({ reservationId: id, propertyId: id }),
  rest: {
    method: "POST",
    path: "/api/v1/reservations/{id}/cancel",
    idKey: "reservationId",
  },
  run: async (ctx, i) => ({
    reservationId: i.reservationId,
    status: "cancelled",
    ...(await cancelDirectBooking(ctx, i.reservationId, i.propertyId)),
  }),
});

// ---- conversations -------------------------------------------------------------------------

const INBOX: [InboxView, ...InboxView[]] = [
  "needs_reply",
  "all",
  "breaching_sla",
  "inquiries",
  "arriving",
  "in_house",
  "closed",
];

export const listConversations = op({
  name: "list_conversations",
  title: "List guest conversations",
  description:
    "List guest conversations from every channel (Airbnb, Booking.com, direct email). filter=needs_reply (default) gives the ones waiting for the host, most urgent first; all gives every open one. Each has the last message preview and the reservation it belongs to.",
  permission: "message:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({
    filter: z.enum(INBOX).default("needs_reply"),
    propertyId: id.optional(),
    q: z.string().max(100).optional().describe("Search guest name, text or tag"),
    limit: limit(50, 20),
  }),
  rest: { method: "GET", path: "/api/v1/conversations" },
  run: async (ctx, i) => {
    const nowIso = new Date().toISOString();
    const rows = await (
      await messaging(ctx)
    ).list({
      view: i.filter,
      userId: ctx.userId,
      nowIso,
      today: await portfolioToday(ctx),
      propertyId: i.propertyId ?? null,
      search: i.q ?? null,
    });
    return {
      filter: i.filter,
      total: rows.length,
      conversations: rows.slice(0, i.limit).map((t) => ({
        id: t.id,
        propertyId: t.propertyId,
        property: t.propertyTitle,
        channel: providerLabel(t.provider),
        guest: t.guestName,
        language: t.guestLanguage,
        kind: t.kind,
        state: t.state,
        unread: t.unreadCount,
        lastMessage: t.preview,
        lastMessageAt: t.lastMessageAt,
        replyDueAt: t.firstResponseDueAt,
        reservationId: t.bookingId,
        arrival: t.arrivalDate,
        departure: t.departureDate,
      })),
    };
  },
});

export const readConversation = op({
  name: "read_conversation",
  title: "Read a conversation",
  description:
    "Read a guest conversation: every message in order (guest, host, automation, internal notes), plus the reservation it belongs to. Reading here does not mark it read for the team.",
  permission: "message:read",
  scope: "organization",
  write: false,
  subject: (i) => ({ kind: "message_thread", id: i.conversationId }),
  schema: z.object({ conversationId: id, limit: limit(200, 50) }),
  rest: { method: "GET", path: "/api/v1/conversations/{id}", idKey: "conversationId" },
  run: async (ctx, i) => {
    const d = await (await messaging(ctx)).detail(i.conversationId, new Date().toISOString());
    if (!d) throw new HttpProblem(404, "not_found", "Conversation not found");
    return {
      id: d.id,
      propertyId: d.propertyId,
      property: d.propertyTitle,
      channel: providerLabel(d.provider),
      guest: d.guestName,
      language: d.guestLanguage,
      state: d.state,
      reservation: d.booking,
      messages: d.messages.slice(-i.limit).map((m) => ({
        id: m.id,
        at: m.sentAt,
        from: m.kind === "note" ? "note" : m.direction === "inbound" ? "guest" : m.authorType,
        author: m.authorName,
        text: m.body,
        ...(m.deliveryState ? { delivery: m.deliveryState } : {}),
      })),
    };
  },
});

const threadWrite = {
  scope: "property" as const,
  resolveScope: byProperty,
  subject: (i: { conversationId: string }) => ({ kind: "message_thread", id: i.conversationId }),
  redact: ["text"],
};
const threadInput = {
  conversationId: id,
  propertyId: id.describe("The conversation's propertyId"),
  text: z.string().trim().min(1).max(5000),
};

export const sendMessage = op({
  name: "send_message",
  title: "Send a message to the guest",
  description:
    "Send a reply to the guest in a conversation. It goes out through the channel the guest wrote on (Airbnb, Booking.com…) or by email for direct bookings, as the host. Sent immediately: write it as the final message, in the guest's language.",
  permission: "message:send",
  ...threadWrite,
  write: true,
  destructive: true,
  schema: z.object(threadInput),
  rest: { method: "POST", path: "/api/v1/conversations/{id}/messages", idKey: "conversationId" },
  run: async (ctx, i) => {
    const t = await assertThreadInProperty(ctx, i.conversationId, i.propertyId);
    const messageId = await (
      await messaging(ctx)
    ).queueGuestMessage(i.conversationId, {
      authorType: "staff",
      authorId: ctx.userId,
      body: i.text,
      sentAt: new Date().toISOString(),
    });
    await queueDelivery(ctx, messageId);
    return { messageId, delivery: "queued", channel: providerLabel(t.provider) };
  },
});

export const addNote = op({
  name: "add_note",
  title: "Add an internal note",
  description:
    'Add an internal note to a conversation, for the team only: the guest never sees it. Use it to leave context ("guest asked for late check-out, owner agreed").',
  permission: "message:send",
  ...threadWrite,
  write: true,
  schema: z.object(threadInput),
  rest: { method: "POST", path: "/api/v1/conversations/{id}/notes", idKey: "conversationId" },
  run: async (ctx, i) => {
    await assertThreadInProperty(ctx, i.conversationId, i.propertyId);
    const noteId = await (
      await messaging(ctx)
    ).addNote(i.conversationId, ctx.userId, i.text, new Date().toISOString());
    return { noteId };
  },
});

// ---- reviews -------------------------------------------------------------------------------

export const listReviews = op({
  name: "list_reviews",
  title: "List guest reviews",
  description:
    "List guest reviews from the channels, newest first. filter=needs_reply gives the ones still waiting for a host response. rating is out of 10 (Airbnb's stars are doubled).",
  permission: "review:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({
    filter: z.enum(["all", "needs_reply"]).default("all"),
    propertyId: id.optional(),
    maxRating: z.coerce
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe("Only ratings up to this"),
    limit: limit(100, 20),
  }),
  rest: { method: "GET", path: "/api/v1/reviews" },
  run: async (ctx, i) => {
    const rows = await (
      await messaging(ctx)
    ).listReviews({
      propertyId: i.propertyId ?? null,
      maxRating: i.maxRating ?? null,
      responseState: i.filter === "needs_reply" ? "pending" : null,
    });
    return {
      total: rows.length,
      reviews: rows.slice(0, i.limit).map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        property: r.propertyTitle,
        channel: providerLabel(r.provider),
        rating: r.rating,
        guest: r.guestName,
        text: r.body,
        receivedAt: r.receivedAt,
        canReply: r.canRespond,
        replyDueAt: r.responseDueAt,
        reply: r.response,
        reservationId: r.bookingId,
      })),
    };
  },
});

export const replyToReview = op({
  name: "reply_to_review",
  title: "Reply to a review",
  description:
    "Publish the host's public response to a guest review on the channel. Public and usually final: keep it short, gracious and specific.",
  permission: "review:respond",
  scope: "property",
  write: true,
  destructive: true,
  resolveScope: byProperty,
  subject: (i) => ({ kind: "review", id: i.reviewId }),
  schema: z.object({
    reviewId: id,
    propertyId: id.describe("The review's propertyId"),
    text: z.string().trim().min(1).max(5000),
  }),
  rest: { method: "POST", path: "/api/v1/reviews/{id}/reply", idKey: "reviewId" },
  run: async (ctx, i) => {
    const repo = await messaging(ctx);
    const review = (await repo.listReviews({ propertyId: i.propertyId })).find(
      (r) => r.id === i.reviewId,
    );
    if (!review) throw new HttpProblem(404, "not_found", "Review not found in this property");
    if (!review.canRespond)
      throw new HttpProblem(422, "unsupported", "This channel does not accept responses");
    const responseId = await repo.queueReviewResponse(review.id, i.text, ctx.userId);
    await queueDelivery(ctx, `review:${responseId}`);
    return { responseId, delivery: "queued" };
  },
});

// ---- channels, sync, today -----------------------------------------------------------------

export const listChannels = op({
  name: "list_channels",
  title: "List channel connections",
  description:
    "List the OTA connections (Airbnb, Booking.com, Expedia…) per property: state, whether it is active, the last push, any error, and nights the channel refused.",
  permission: "channel:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({}),
  rest: { method: "GET", path: "/api/v1/channels" },
  run: async (ctx) =>
    (await new DrizzleChannelRepository(ctx.tx, ctx.orgId).health()).map((c) => ({
      id: c.id,
      propertyId: c.propertyId,
      property: c.propertyTitle,
      channel: c.adapterCode,
      state: c.state,
      active: c.isActive,
      lastPushAt: c.lastPushAt,
      lastError: c.lastError,
      failedNights: (c as { failedCells?: number }).failedCells ?? 0,
      pendingNights: (c as { pendingCells?: number }).pendingCells ?? 0,
      bookings30d: c.bookings30d,
      unmappedBookings: c.unmappedBookings,
    })),
});

export const getSyncHealth = op({
  name: "get_sync_health",
  title: "Check sync health",
  description:
    "Check that the channels match what is set here: nights pending, failed or differing from a channel, bookings received in the last day, the last push and the last check.",
  permission: "ari:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({}),
  rest: { method: "GET", path: "/api/v1/sync-health" },
  run: async (ctx) => {
    const repo = new DrizzleSyncHealthRepository(ctx.tx, ctx.orgId);
    const [summary, differing] = await Promise.all([
      repo.summary(new Date().toISOString()),
      repo.differing(),
    ]);
    const { perHour, ...rest } = summary;
    void perHour;
    return {
      ...rest,
      inSync: summary.failedCells + summary.conflictedCells === 0,
      differing: differing.slice(0, 25),
    };
  },
});

export const getToday = op({
  name: "get_today",
  title: "Today at a glance",
  description:
    "The day's summary: who arrives and leaves today, how many are in house, and what needs the host (conversations waiting for a reply, changed or unmapped reservations, nights a channel refused).",
  permission: "booking:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({}),
  rest: { method: "GET", path: "/api/v1/today" },
  run: async (ctx) => {
    const today = await portfolioToday(ctx);
    const repo = await reservationsRepo(ctx);
    const brief = (r: Awaited<ReturnType<typeof repo.list>>["rows"][number]) => ({
      reservationId: r.id,
      guest: r.guestFullName,
      property: r.propertyTitle,
      channel: r.otaName,
      nights: r.nights,
      unit: r.unitNames,
    });
    const [arrivals, departures, inStay, modified, unmapped] = await Promise.all([
      repo.list({ view: "arrivals_today", limit: 50 }, today),
      repo.list({ view: "departures_today", limit: 50 }, today),
      repo.count({ view: "in_stay" }, today),
      repo.count({ view: "modified_since_yesterday" }, today),
      repo.count({ view: "unmapped" }, today),
    ]);
    const counts = await (await messaging(ctx)).counts(ctx.userId, new Date().toISOString());
    const sync = await new DrizzleSyncHealthRepository(ctx.tx, ctx.orgId).summary(
      new Date().toISOString(),
    );
    return {
      today,
      arrivals: arrivals.rows.filter((r) => r.status !== "cancelled").map(brief),
      departures: departures.rows.filter((r) => r.status !== "cancelled").map(brief),
      inHouse: inStay,
      needsYou: {
        conversationsWaiting: counts.needsReply,
        conversationsPastDue: counts.breaching,
        reservationsChanged: modified,
        reservationsUnmapped: unmapped,
        nightsRefusedByChannel: sync.failedCells + sync.conflictedCells,
      },
    };
  },
});

/** Every operation, in the order the MCP server lists them. */
export const OPS: readonly Op[] = [
  getToday,
  listProperties,
  getCalendar,
  setPrices,
  setAvailability,
  setMinStay,
  listReservations,
  getReservation,
  createReservation,
  cancelReservation,
  listConversations,
  readConversation,
  sendMessage,
  addNote,
  listReviews,
  replyToReview,
  listChannels,
  getSyncHealth,
] as unknown as readonly Op[];
