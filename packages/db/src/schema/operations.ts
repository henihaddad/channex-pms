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
import { organization, property, user } from "./identity.js";
import { roomType } from "./inventory.js";
import { unit } from "./inventory-m2.js";
import { booking, bookingRoom } from "./reservations.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Blocks: maintenance, owner stays, staff, renovation (spec 03 §3.6). Owner stays feed the statement. */
export const unitBlock = pgTable(
  "unit_block",
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
    unitId: uuid("unit_id").references(() => unit.id),
    dateFrom: date("date_from", { mode: "string" }).notNull(),
    /** Exclusive. */
    dateTo: date("date_to", { mode: "string" }).notNull(),
    reason: text("reason").notNull(), // maintenance|owner_stay|staff|renovation
    reducesAvailability: boolean("reduces_availability").notNull().default(true),
    note: text("note"),
    ownerId: uuid("owner_id"),
    maintenanceIssueId: uuid("maintenance_issue_id"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [index("unit_block_property_dates_idx").on(t.propertyId, t.dateFrom, t.dateTo)],
);

export const crew = pgTable("crew", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  serviceArea: text("service_area"),
  skills: jsonb("skills").notNull().default([]).$type<string[]>(),
  /** Base position for routing suggestions. */
  lat: text("lat"),
  lng: text("lng"),
  createdAt: ts("created_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

export const crewMember = pgTable(
  "crew_member",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crew.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull().default("cleaner"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] })],
);

export const checklist = pgTable("checklist", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  taskType: text("task_type").notNull().default("changeover"),
  items: jsonb("items")
    .notNull()
    .$type<Array<{ key: string; label: string; requiresPhoto: boolean }>>(),
  createdAt: ts("created_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

/** Generated from booking diffs; keyed by (unit, date, type) (spec 03 §3.6, OPS-1). */
export const turnoverTask = pgTable(
  "turnover_task",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => unit.id),
    date: date("date", { mode: "string" }).notNull(),
    type: text("type").notNull(),
    windowFrom: text("window_from").notNull(),
    windowTo: text("window_to").notNull(),
    isSameDay: boolean("is_same_day").notNull().default(false),
    departingBookingId: uuid("departing_booking_id"),
    arrivingBookingId: uuid("arriving_booking_id"),
    state: text("state").notNull().default("planned"),
    assigneeId: uuid("assignee_id"),
    crewId: uuid("crew_id"),
    sequence: integer("sequence"),
    travelMinutesEstimate: integer("travel_minutes_estimate"),
    checklistId: uuid("checklist_id"),
    progress: jsonb("progress")
      .notNull()
      .default([])
      .$type<Array<{ key: string; done: boolean; photoRef?: string }>>(),
    photos: jsonb("photos")
      .notNull()
      .default([])
      .$type<Array<{ ref: string; takenAt: string; lat?: number; lng?: number }>>(),
    notes: text("notes"),
    durationActualMinutes: integer("duration_actual_minutes"),
    escalatedLevel: text("escalated_level"),
    lastChange: text("last_change"),
    acceptedAt: ts("accepted_at"),
    startedAt: ts("started_at"),
    doneAt: ts("done_at"),
    inspectedAt: ts("inspected_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("turnover_task_key_idx").on(t.unitId, t.date, t.type),
    index("turnover_task_property_date_idx").on(t.propertyId, t.date),
    index("turnover_task_assignee_idx").on(t.assigneeId, t.date),
  ],
);

export const maintenanceIssue = pgTable(
  "maintenance_issue",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    unitId: uuid("unit_id").references(() => unit.id),
    taskId: uuid("task_id"),
    reportedBy: uuid("reported_by"),
    reportedVia: text("reported_via").notNull().default("staff"), // staff|cleaner|guest|owner
    severity: text("severity").notNull().default("normal"), // low|normal|high|urgent
    category: text("category").notNull().default("general"),
    description: text("description").notNull(),
    photos: jsonb("photos").notNull().default([]).$type<string[]>(),
    state: text("state").notNull().default("open"), // open|assigned|in_progress|closed
    blocksAvailability: boolean("blocks_availability").notNull().default(false),
    assigneeId: uuid("assignee_id"),
    vendor: text("vendor"),
    costMinor: bigint("cost_minor", { mode: "number" }),
    rebillToOwner: boolean("rebill_to_owner").notNull().default(false),
    ownerExpenseId: uuid("owner_expense_id"),
    createdAt: ts("created_at").notNull().default(now()),
    closedAt: ts("closed_at"),
  },
  (t) => [index("maintenance_issue_property_idx").on(t.propertyId, t.state)],
);

/** Time-boxed, sealed, never logged; revoked on cancellation or moved dates within a minute (INV-14, INV-7). */
export const accessCredential = pgTable(
  "access_credential",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    unitId: uuid("unit_id").references(() => unit.id),
    type: text("type").notNull(),
    valueEnc: text("value_enc").notNull(),
    valueMasked: text("value_masked").notNull(),
    validFrom: ts("valid_from").notNull(),
    validTo: ts("valid_to").notNull(),
    providerRef: text("provider_ref"),
    deliveryState: text("delivery_state").notNull().default("pending"), // pending|scheduled|delivered
    issuedAt: ts("issued_at").notNull().default(now()),
    issuedBy: text("issued_by"),
    revokedAt: ts("revoked_at"),
    revokeReason: text("revoke_reason"),
  },
  (t) => [index("access_credential_booking_idx").on(t.bookingId)],
);

export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    visibility: text("visibility").notNull().default("staff"),
    authorId: uuid("author_id"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("note_subject_idx").on(t.subjectType, t.subjectId)],
);

/** Folio per booking, splittable (spec 08 §8.9). */
export const folio = pgTable(
  "folio",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    bookingId: uuid("booking_id").references(() => booking.id),
    label: text("label").notNull().default("Main"),
    currency: text("currency").notNull(),
    state: text("state").notNull().default("open"), // open|closed
    createdAt: ts("created_at").notNull().default(now()),
    closedAt: ts("closed_at"),
  },
  (t) => [index("folio_booking_idx").on(t.bookingId)],
);

export const folioLine = pgTable(
  "folio_line",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    folioId: uuid("folio_id")
      .notNull()
      .references(() => folio.id),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    /** Idempotency key for automatic postings (daily close). */
    postingKey: text("posting_key"),
    invoiceId: uuid("invoice_id"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [
    index("folio_line_folio_idx").on(t.folioId),
    uniqueIndex("folio_line_posting_key_idx").on(t.postingKey),
  ],
);

export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    folioId: uuid("folio_id")
      .notNull()
      .references(() => folio.id),
    method: text("method").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    state: text("state").notNull().default("captured"), // captured|held|released|refunded
    reason: text("reason"),
    providerRef: text("provider_ref"),
    receivedAt: ts("received_at").notNull().default(now()),
    createdBy: text("created_by"),
  },
  (t) => [index("payment_folio_idx").on(t.folioId)],
);

/** Gapless per property and year: the sequence row is locked on issue. */
export const invoiceSequence = pgTable(
  "invoice_sequence",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    year: integer("year").notNull(),
    prefix: text("prefix").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.year] })],
);

export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    folioId: uuid("folio_id")
      .notNull()
      .references(() => folio.id),
    number: text("number").notNull(),
    kind: text("kind").notNull().default("invoice"), // invoice|credit_note
    currency: text("currency").notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    fxRate: text("fx_rate"),
    issuedAt: ts("issued_at").notNull().default(now()),
    issuedBy: text("issued_by"),
    creditsInvoiceId: uuid("credits_invoice_id"),
    pdfRef: text("pdf_ref"),
  },
  (t) => [uniqueIndex("invoice_number_idx").on(t.propertyId, t.number)],
);

/** Business date per property; daily close is idempotent and re-runnable (spec 08 §8.9). */
export const dailyClose = pgTable(
  "daily_close",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    postedLines: integer("posted_lines").notNull().default(0),
    flaggedFolios: jsonb("flagged_folios")
      .notNull()
      .default([])
      .$type<Array<{ bookingId: string; balanceMinor: number }>>(),
    runs: integer("runs").notNull().default(1),
    closedAt: ts("closed_at").notNull().default(now()),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.businessDate] })],
);

export const savedView = pgTable("saved_view", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  userId: uuid("user_id").notNull(),
  surface: text("surface").notNull().default("reservations"),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull().$type<Record<string, unknown>>(),
  createdAt: ts("created_at").notNull().default(now()),
});

/** RES-3: a modification badge persists until acknowledged. */
export const bookingAcknowledgement = pgTable(
  "booking_acknowledgement",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    /** The Channex revision id (what booking.last_revision_id holds). */
    revisionId: text("revision_id").notNull(),
    acknowledgedBy: uuid("acknowledged_by").notNull(),
    acknowledgedAt: ts("acknowledged_at").notNull().default(now()),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.revisionId] })],
);

/** Front desk (hotel kind): check-in/out state per booking room. */
export const stayState = pgTable("stay_state", {
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  bookingRoomId: uuid("booking_room_id")
    .primaryKey()
    .references(() => bookingRoom.id, { onDelete: "cascade" }),
  bookingId: uuid("booking_id").notNull(),
  state: text("state").notNull().default("expected"), // expected|checked_in|checked_out|no_show
  checkedInAt: ts("checked_in_at"),
  checkedOutAt: ts("checked_out_at"),
  noShowReason: text("no_show_reason"),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().default(now()),
});
