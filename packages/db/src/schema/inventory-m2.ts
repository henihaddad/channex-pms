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
  uuid,
} from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";
import { roomType } from "./inventory.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Physical units are ours alone (spec 03 §3.1 rule 4); never sent to the provider. */
export const unit = pgTable(
  "unit",
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
    name: text("name").notNull(),
    floor: text("floor"),
    attributes: jsonb("attributes").notNull().default({}),
    access: jsonb("access").notNull().default({}),
    status: text("status").notNull().default("clean"), // clean|dirty|in_progress|inspected|out_of_order|out_of_service
    isSystemManaged: boolean("is_system_managed").notNull().default(false),
    ownerAgreementId: uuid("owner_agreement_id"),
    createdAt: ts("created_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("unit_property_idx").on(t.propertyId),
    index("unit_room_type_idx").on(t.roomTypeId),
  ],
);

export const propertyTemplate = pgTable("property_template", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull(),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

/** Resumable provisioning state per property (PROV-1). */
export const propertyProvisioning = pgTable("property_provisioning", {
  propertyId: uuid("property_id")
    .primaryKey()
    .references(() => property.id),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  step: text("step").notNull().default("group"),
  refs: jsonb("refs").notNull().default({}).$type<Record<string, string>>(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: ts("updated_at").notNull().default(now()),
});

export const season = pgTable("season", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  propertyId: uuid("property_id").references(() => property.id),
  name: text("name").notNull(),
  dateRanges: jsonb("date_ranges").notNull().$type<Array<{ from: string; to: string }>>(),
  colour: text("colour").notNull().default("#94a3b8"),
});

export const policy = pgTable("policy", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => property.id),
  title: text("title").notNull(),
  cancellation: jsonb("cancellation").notNull().default({}),
  deposit: jsonb("deposit").notNull().default({}),
  checkInTime: text("check_in_time").notNull().default("15:00"),
  checkOutTime: text("check_out_time").notNull().default("11:00"),
  channexPolicyId: text("channex_policy_id"),
});

export const taxSet = pgTable("tax_set", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => property.id),
  title: text("title").notNull(),
  taxes: jsonb("taxes")
    .notNull()
    .$type<
      Array<{ name: string; logic: string; rate: number; appliesTo: string; isInclusive: boolean }>
    >(),
  channexTaxSetId: text("channex_tax_set_id"),
});

export const photo = pgTable("photo", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => property.id),
  roomTypeId: uuid("room_type_id"),
  storageKey: text("storage_key").notNull(),
  position: integer("position").notNull().default(0),
  kind: text("kind").notNull().default("photo"),
  channexPhotoId: text("channex_photo_id"),
});

/** Keep-back, cut-off and release rules (spec 06 §6.4). */
export const availabilityRule = pgTable("availability_rule", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => property.id),
  roomTypeId: uuid("room_type_id").references(() => roomType.id),
  type: text("type").notNull(), // keep_back|cut_off|release
  params: jsonb("params").notNull().default({}),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
  enabled: boolean("enabled").notNull().default(true),
});

/** One atomic, reversible, audited job (BULK-2). */
export const bulkOperation = pgTable(
  "bulk_operation",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    input: jsonb("input").notNull(),
    cellCount: integer("cell_count").notNull(),
    inverse: jsonb("inverse").notNull(),
    state: text("state").notNull().default("applied"), // applied|undone
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
    undoneAt: ts("undone_at"),
  },
  (t) => [index("bulk_operation_property_idx").on(t.propertyId, t.createdAt)],
);
