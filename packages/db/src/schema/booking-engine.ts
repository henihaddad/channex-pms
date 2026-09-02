import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";
import { roomType, ratePlan } from "./inventory.js";
import { booking } from "./reservations.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Per-property engine configuration (spec 10 §10.3–10.5). */
export const bookingEngineSettings = pgTable("booking_engine_settings", {
  propertyId: uuid("property_id")
    .primaryKey()
    .references(() => property.id),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  enabled: boolean("enabled").notNull().default(false),
  /** The `direct` ChannelConnection (spec 10 §10.1). */
  connectionId: uuid("connection_id"),
  guarantee: jsonb("guarantee")
    .notNull()
    .default({ kind: "pay_at_property" })
    .$type<Record<string, unknown>>(),
  taxes: jsonb("taxes")
    .notNull()
    .default({ vatBps: 0, cityTaxPerPersonNightMinor: 0, cityTaxMaxNights: null })
    .$type<Record<string, unknown>>(),
  theme: jsonb("theme").notNull().default({}).$type<Record<string, string>>(),
  description: text("description"),
  attributes: jsonb("attributes").notNull().default([]).$type<string[]>(),
  lat: text("lat"),
  lng: text("lng"),
  accessRevealHours: integer("access_reveal_hours").notNull().default(24),
  analyticsSnippet: text("analytics_snippet"),
  abandonmentEmails: boolean("abandonment_emails").notNull().default(false),
  /** Arrival instructions and house manual shown in the guest portal (spec 10 §10.6). */
  houseManual: text("house_manual"),
  updatedAt: ts("updated_at").notNull().default(now()),
});

/** BE-5: a hold counts against availability until it converts, is released or expires. */
export const bookingHold = pgTable(
  "booking_hold",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomType.id),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlan.id),
    arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
    departureDate: date("departure_date", { mode: "string" }).notNull(),
    rooms: integer("rooms").notNull().default(1),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    childAges: jsonb("child_ages").notNull().default([]).$type<number[]>(),
    quote: jsonb("quote").notNull().$type<Record<string, unknown>>(),
    promoCode: text("promo_code"),
    extras: jsonb("extras").notNull().default([]).$type<Array<{ id: string; quantity: number }>>(),
    locale: text("locale").notNull().default("en"),
    /** Guest details, sealed once entered (abandonment recovery reads them only with consent). */
    guestEnc: text("guest_enc"),
    consentMarketing: boolean("consent_marketing").notNull().default(false),
    state: text("state").notNull().default("held"), // held|converted|expired|released
    expiresAt: ts("expires_at").notNull(),
    /** BE-6: the confirm button's key; a second click finds the booking already made. */
    idempotencyKey: text("idempotency_key"),
    bookingId: uuid("booking_id"),
    paymentIntentId: text("payment_intent_id"),
    /** Abandonment recovery (spec 10 §10.5): one mail per abandoned checkout, never more. */
    recoveryMailedAt: ts("recovery_mailed_at"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [
    index("booking_hold_room_type_idx").on(t.roomTypeId, t.state, t.expiresAt),
    uniqueIndex("booking_hold_idempotency_idx").on(t.orgId, t.idempotencyKey),
  ],
);

export const promoCode = pgTable(
  "promo_code",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id").references(() => property.id),
    code: text("code").notNull(),
    kind: text("kind").notNull(), // percent|amount
    value: integer("value").notNull(),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    stayFrom: date("stay_from", { mode: "string" }),
    stayTo: date("stay_to", { mode: "string" }),
    minNights: integer("min_nights"),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    singleUse: boolean("single_use").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("promo_code_org_code_idx").on(t.orgId, t.code)],
);

export const extra = pgTable(
  "extra",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    name: text("name").notNull(),
    description: text("description"),
    priceMinor: integer("price_minor").notNull(),
    per: text("per").notNull().default("stay"), // stay|night|person
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("extra_property_idx").on(t.propertyId, t.active)],
);

/** Guest portal sessions (spec 10 §10.6): scoped to one booking, short-lived, from a single-use magic link. */
export const guestSession = pgTable(
  "guest_session",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().default(now()),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("guest_session_booking_idx").on(t.bookingId)],
);

/** Online pre-check-in (spec 10 §10.6): feeds the front desk board. */
export const preCheckin = pgTable("pre_checkin", {
  bookingId: uuid("booking_id")
    .primaryKey()
    .references(() => booking.id),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  arrivalTime: text("arrival_time"),
  idDocumentRef: text("id_document_ref"),
  preferences: text("preferences"),
  guests: jsonb("guests").notNull().default([]).$type<Array<{ name: string; surname: string }>>(),
  completedAt: ts("completed_at"),
  updatedAt: ts("updated_at").notNull().default(now()),
});
