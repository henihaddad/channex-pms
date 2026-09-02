import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";
import { booking } from "./reservations.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** One row per booked room-night as it stands now (spec 11 §11.5); a cancellation restates its stay date. */
export const factRoomNight = pgTable(
  "fact_room_night",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    date: date("date", { mode: "string" }).notNull(),
    roomTypeId: uuid("room_type_id"),
    channel: text("channel").notNull(),
    status: text("status").notNull(), // confirmed|cancelled|no_show
    roomRevenueMinor: bigint("room_revenue_minor", { mode: "number" }).notNull(),
    commissionMinor: bigint("commission_minor", { mode: "number" }).notNull().default(0),
    commissionEstimated: boolean("commission_estimated").notNull().default(false),
    withheldTaxMinor: bigint("withheld_tax_minor", { mode: "number" }).notNull().default(0),
    leadDays: integer("lead_days"),
    isDirect: boolean("is_direct").notNull().default(false),
    currency: text("currency").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.date] }),
    index("fact_room_night_property_date_idx").on(t.propertyId, t.date),
    index("fact_room_night_org_date_idx").on(t.orgId, t.date),
  ],
);

export const factBooking = pgTable(
  "fact_booking",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    bookingId: uuid("booking_id")
      .primaryKey()
      .references(() => booking.id),
    channel: text("channel").notNull(),
    bookedDate: date("booked_date", { mode: "string" }).notNull(),
    arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
    departureDate: date("departure_date", { mode: "string" }).notNull(),
    nights: integer("nights").notNull(),
    status: text("status").notNull(), // confirmed|cancelled|no_show
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    roomRevenueMinor: bigint("room_revenue_minor", { mode: "number" }).notNull(),
    commissionMinor: bigint("commission_minor", { mode: "number" }).notNull().default(0),
    leadDays: integer("lead_days").notNull(),
    cancelledDate: date("cancelled_date", { mode: "string" }),
    currency: text("currency").notNull(),
  },
  (t) => [
    index("fact_booking_property_booked_idx").on(t.propertyId, t.bookedDate),
    index("fact_booking_property_arrival_idx").on(t.propertyId, t.arrivalDate),
  ],
);

/** The daily KPI inputs per property (spec 11 §11.1): every screen reads these; `kpis()` in core does the arithmetic. */
export const aggDailyKpi = pgTable(
  "agg_daily_kpi",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    date: date("date", { mode: "string" }).notNull(),
    roomsAvailable: integer("rooms_available").notNull(),
    roomsSold: integer("rooms_sold").notNull(),
    roomRevenueMinor: bigint("room_revenue_minor", { mode: "number" }).notNull(),
    totalRevenueMinor: bigint("total_revenue_minor", { mode: "number" }).notNull(),
    commissionMinor: bigint("commission_minor", { mode: "number" }).notNull(),
    withheldTaxMinor: bigint("withheld_tax_minor", { mode: "number" }).notNull(),
    bookingsCreated: integer("bookings_created").notNull(),
    cancellations: integer("cancellations").notNull(),
    arrivals: integer("arrivals").notNull(),
    noShows: integer("no_shows").notNull(),
    directNights: integer("direct_nights").notNull(),
    currency: text("currency").notNull(),
    computedAt: ts("computed_at").notNull().default(now()),
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.date] }),
    index("agg_daily_kpi_org_date_idx").on(t.orgId, t.date),
  ],
);

/** Monthly targets for "vs budget" (spec 11 §11.1). */
export const budget = pgTable(
  "budget",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    month: date("month", { mode: "string" }).notNull(),
    roomRevenueMinor: bigint("room_revenue_minor", { mode: "number" }).notNull(),
    occupancyBps: integer("occupancy_bps"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("budget_property_month_idx").on(t.propertyId, t.month)],
);

/** Alerts (spec 11 §11.4): one row per (type, key, day); the action rate per type is tracked (ALRT-1). */
export const alert = pgTable(
  "alert",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id").references(() => property.id),
    type: text("type").notNull(),
    key: text("key").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    link: text("link").notNull(),
    state: text("state").notNull().default("open"), // open|acknowledged|actioned|resolved
    raisedOn: date("raised_on", { mode: "string" }).notNull(),
    createdAt: ts("created_at").notNull().default(now()),
    acknowledgedBy: uuid("acknowledged_by"),
    acknowledgedAt: ts("acknowledged_at"),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    uniqueIndex("alert_open_idx").on(t.orgId, t.type, t.key, t.raisedOn),
    index("alert_state_idx").on(t.orgId, t.state, t.createdAt),
  ],
);

/** Scheduled email reports (spec 11 §11.3). */
export const reportSchedule = pgTable(
  "report_schedule",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    reportKey: text("report_key").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").notNull().default({}).$type<Record<string, unknown>>(),
    recipients: jsonb("recipients").notNull().default([]).$type<string[]>(),
    cadence: text("cadence").notNull(), // daily|weekly|monthly
    format: text("format").notNull().default("csv"), // csv|pdf
    enabled: boolean("enabled").notNull().default(true),
    lastSentAt: ts("last_sent_at"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("report_schedule_org_idx").on(t.orgId, t.enabled)],
);
