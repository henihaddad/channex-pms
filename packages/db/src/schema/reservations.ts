import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";
import { ratePlan, roomType } from "./inventory.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Persist first, process second. Always (spec 03 §3.4, HOOK-1). */
export const inboundWebhook = pgTable(
  "inbound_webhook",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    state: text("state").notNull().default("received"), // received|processed|failed|dead
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    receivedAt: ts("received_at").notNull().default(now()),
    processedAt: ts("processed_at"),
  },
  (t) => [index("inbound_webhook_state_idx").on(t.state, t.receivedAt)],
);

/** Guest PII: sealed columns, hashed lookup key, erasable (spec 03 §3.5). */
export const guest = pgTable(
  "guest",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    nameEnc: text("name_enc").notNull(),
    surnameEnc: text("surname_enc").notNull(),
    emailEnc: text("email_enc"),
    phoneEnc: text("phone_enc"),
    country: text("country"),
    language: text("language"),
    dedupeHash: text("dedupe_hash").notNull(),
    createdAt: ts("created_at").notNull().default(now()),
    erasedAt: ts("erased_at"),
  },
  (t) => [index("guest_dedupe_idx").on(t.orgId, t.dedupeHash)],
);

/** A projection of its ordered revisions (spec 03 §3.5). */
export const booking = pgTable(
  "booking",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    channexBookingId: text("channex_booking_id").notNull().unique(),
    otaReservationCode: text("ota_reservation_code"),
    otaName: text("ota_name"),
    channelConnectionId: uuid("channel_connection_id"),
    status: text("status").notNull(), // new|modified|cancelled
    arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
    departureDate: date("departure_date", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }).notNull(),
    otaCommissionMinor: bigint("ota_commission_minor", { mode: "number" }),
    guestId: uuid("guest_id").references(() => guest.id),
    mappingState: text("mapping_state").notNull().default("mapped"), // mapped|unmapped_room|unmapped_rate
    opsState: text("ops_state").notNull().default("expected"),
    lastRevisionId: uuid("last_revision_id"),
    lastRevisionInsertedAt: text("last_revision_inserted_at"),
    lastSystemId: text("last_system_id"),
    ackedAt: ts("acked_at"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [
    index("booking_property_arrival_idx").on(t.propertyId, t.arrivalDate),
    index("booking_mapping_idx").on(t.orgId, t.mappingState),
  ],
);

/** Append-only; system_id is Channex's idempotency key (INV-4, BK-2, BK-4). */
export const bookingRevision = pgTable(
  "booking_revision",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    channexRevisionId: text("channex_revision_id").notNull().unique(),
    systemId: text("system_id").notNull().unique(),
    revisionType: text("revision_type").notNull(), // new|modified|cancelled
    rawPayload: jsonb("raw_payload").notNull(),
    normalised: jsonb("normalised").notNull(),
    diffFromPrevious: jsonb("diff_from_previous"),
    insertedAt: text("inserted_at").notNull(),
    receivedAt: ts("received_at").notNull().default(now()),
    appliedAt: ts("applied_at"),
    ackedAt: ts("acked_at"),
  },
  (t) => [
    index("booking_revision_booking_idx").on(t.bookingId, t.insertedAt),
    index("booking_revision_unacked_idx").on(t.orgId, t.ackedAt),
  ],
);

export const bookingRoom = pgTable(
  "booking_room",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    roomTypeId: uuid("room_type_id").references(() => roomType.id),
    ratePlanId: uuid("rate_plan_id").references(() => ratePlan.id),
    checkinDate: date("checkin_date", { mode: "string" }).notNull(),
    checkoutDate: date("checkout_date", { mode: "string" }).notNull(),
    occupancy: jsonb("occupancy")
      .notNull()
      .$type<{ adults: number; children: number; infants: number; ages?: number[] }>(),
    guestNames: jsonb("guest_names").notNull().$type<Array<{ name: string; surname: string }>>(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    assignedUnitId: uuid("assigned_unit_id"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("booking_room_booking_idx").on(t.bookingId)],
);

/** The basis for revenue reports and owner statements (spec 03 §3.5). */
export const bookingRoomDay = pgTable(
  "booking_room_day",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    bookingRoomId: uuid("booking_room_id")
      .notNull()
      .references(() => bookingRoom.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    roomTypeId: uuid("room_type_id"),
    date: date("date", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    status: text("status").notNull().default("confirmed"), // confirmed|cancelled
  },
  (t) => [
    primaryKey({ columns: [t.bookingRoomId, t.date] }),
    index("booking_room_day_property_date_idx").on(t.propertyId, t.date),
  ],
);

/** Masked card metadata only (BK-7, INV-7: a check constraint rejects PAN-shaped values). */
export const paymentInstrument = pgTable("payment_instrument", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => booking.id),
  type: text("type").notNull().default("card"),
  cardType: text("card_type"),
  maskedNumber: text("masked_number"),
  expiry: text("expiry"),
  cardholder: text("cardholder"),
  providerTokenRef: text("provider_token_ref"),
  createdAt: ts("created_at").notNull().default(now()),
  purgeAfter: ts("purge_after"),
});
