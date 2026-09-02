import { sql } from "drizzle-orm";
import {
  boolean,
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

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

export const roomType = pgTable(
  "room_type",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    channexRoomTypeId: text("channex_room_type_id"),
    title: text("title").notNull(),
    countOfRooms: integer("count_of_rooms").notNull().default(1),
    occAdults: integer("occ_adults").notNull().default(2),
    occChildren: integer("occ_children").notNull().default(0),
    occInfants: integer("occ_infants").notNull().default(0),
    maxOccupancy: integer("max_occupancy").notNull().default(2),
    defaultOccupancy: integer("default_occupancy").notNull().default(2),
    isSystemManaged: boolean("is_system_managed").notNull().default(false),
    content: jsonb("content").notNull().default({}),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("room_type_property_idx").on(t.propertyId)],
);

export const ratePlan = pgTable(
  "rate_plan",
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
    channexRatePlanId: text("channex_rate_plan_id"),
    title: text("title").notNull(),
    currency: text("currency").notNull(),
    sellMode: text("sell_mode").notNull().default("per_room"),
    parentRatePlanId: uuid("parent_rate_plan_id"),
    derivedOption: jsonb("derived_option").$type<{
      kind: "percent" | "amount";
      direction: "increase" | "decrease";
      value: number;
    } | null>(),
    mealPlan: text("meal_plan"),
    taxSetId: uuid("tax_set_id"),
    policyId: uuid("policy_id"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("rate_plan_property_idx").on(t.propertyId),
    index("rate_plan_room_type_idx").on(t.roomTypeId),
  ],
);

/** Availability per room type per date: desired + synced mirror (spec 03 §3.3, spec 05 §5.4.5). */
export const availabilityDay = pgTable(
  "availability_day",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomType.id),
    date: date("date", { mode: "string" }).notNull(),
    available: integer("available").notNull(),
    syncedAvailable: integer("synced_available"),
    syncState: text("sync_state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by"),
    updatedAt: ts("updated_at").notNull().default(now()),
    syncedAt: ts("synced_at"),
  },
  (t) => [
    primaryKey({ columns: [t.roomTypeId, t.date] }),
    index("availability_day_pending_idx").on(t.propertyId, t.syncState),
  ],
);

/** Rates and restrictions per rate plan per date, as a JSON values object (spec 05 §5.4 fields). */
export const rateDay = pgTable(
  "rate_day",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlan.id),
    date: date("date", { mode: "string" }).notNull(),
    values: jsonb("values").notNull().$type<Record<string, unknown>>(),
    syncedValues: jsonb("synced_values").$type<Record<string, unknown>>(),
    syncState: text("sync_state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    source: text("source").notNull().default("manual"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by"),
    updatedAt: ts("updated_at").notNull().default(now()),
    syncedAt: ts("synced_at"),
  },
  (t) => [
    primaryKey({ columns: [t.ratePlanId, t.date] }),
    index("rate_day_pending_idx").on(t.propertyId, t.syncState),
  ],
);

/** Outbound ARI unit of work, coalescable (spec 03 §3.4). */
export const syncOperation = pgTable(
  "sync_operation",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    kind: text("kind").notNull(), // availability|restrictions|reconcile|provision
    dedupeKey: text("dedupe_key").notNull().unique(),
    payloadHash: text("payload_hash"),
    dateFrom: date("date_from", { mode: "string" }),
    dateTo: date("date_to", { mode: "string" }),
    state: text("state").notNull().default("queued"), // queued|running|done|failed|dead
    attempts: integer("attempts").notNull().default(0),
    entries: integer("entries").notNull().default(0),
    accepted: integer("accepted").notNull().default(0),
    rejected: integer("rejected").notNull().default(0),
    lastError: text("last_error"),
    requestId: text("request_id"),
    createdAt: ts("created_at").notNull().default(now()),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("sync_operation_property_idx").on(t.propertyId, t.createdAt)],
);
