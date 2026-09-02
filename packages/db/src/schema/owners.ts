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
import { organization, property, propertyGroup, user } from "./identity.js";
import { unit } from "./inventory-m2.js";
import { booking } from "./reservations.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Owners are contacts first; a portal login is optional (spec 03 §3.8, spec 17 §17.1). */
export const owner = pgTable(
  "owner",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    type: text("type").notNull().default("individual"), // individual|company
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: jsonb("address").notNull().default({}).$type<Record<string, string>>(),
    taxIdEnc: text("tax_id_enc"),
    /** Provider token or sealed reference; never plain bank details (PAY-1). */
    payoutDetailsRef: text("payout_details_ref"),
    payoutDetailsMasked: text("payout_details_masked"),
    userId: uuid("user_id").references(() => user.id),
    /** The `owner`-kind property group that scopes the portal grant (spec 02 §2.1). */
    groupId: uuid("group_id").references(() => propertyGroup.id),
    locale: text("locale").notNull().default("en"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("owner_org_idx").on(t.orgId, t.name)],
);

export const ownerDocument = pgTable(
  "owner_document",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owner.id),
    kind: text("kind").notNull(), // contract|insurance|tax_form|other
    filename: text("filename").notNull(),
    storageRef: text("storage_ref").notNull(),
    expiresAt: date("expires_at", { mode: "string" }),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("owner_document_owner_idx").on(t.ownerId)],
);

/**
 * One row per agreement version (AGR-1). `agreement_key` groups the versions; a
 * new version closes the previous one's `effective_to`. Overlaps on the same
 * property/unit scope are refused by trigger (INV-12, migration 0013).
 */
export const ownerAgreement = pgTable(
  "owner_agreement",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    agreementKey: uuid("agreement_key").notNull(),
    version: integer("version").notNull().default(1),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owner.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    /** null = the whole property. */
    unitIds: jsonb("unit_ids").$type<string[] | null>(),
    model: jsonb("model").notNull().$type<Record<string, unknown>>(),
    commissionBasis: text("commission_basis").notNull(), // gross|net_of_ota_commission|net_of_tax
    deductibles: jsonb("deductibles").notNull().default({}).$type<Record<string, unknown>>(),
    cleaningFees: jsonb("cleaning_fees").notNull().$type<Record<string, unknown>>(),
    ownerStays: jsonb("owner_stays").notNull().$type<Record<string, unknown>>(),
    ownerStayAllowanceNights: integer("owner_stay_allowance_nights"),
    payout: jsonb("payout").notNull().$type<Record<string, unknown>>(),
    vat: jsonb("vat").notNull().$type<Record<string, unknown>>(),
    currency: text("currency").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    /** Exclusive; null = open-ended. */
    effectiveTo: date("effective_to", { mode: "string" }),
    documentRef: text("document_ref"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("owner_agreement_version_idx").on(t.agreementKey, t.version),
    index("owner_agreement_property_idx").on(t.propertyId, t.effectiveFrom),
    index("owner_agreement_owner_idx").on(t.ownerId),
  ],
);

/** Expenses reach a statement only once approved (EXP-1); markup rules come from the agreement (EXP-2). */
export const ownerExpense = pgTable(
  "owner_expense",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    unitId: uuid("unit_id").references(() => unit.id),
    date: date("date", { mode: "string" }).notNull(),
    category: text("category").notNull(), // cleaning|consumables|maintenance|linen|other
    vendor: text("vendor"),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    receiptRef: text("receipt_ref"),
    rebillable: boolean("rebillable").notNull().default(true),
    rebillReason: text("rebill_reason"),
    state: text("state").notNull().default("submitted"), // submitted|approved|rejected
    submittedBy: uuid("submitted_by"),
    approvedBy: uuid("approved_by"),
    approvedAt: ts("approved_at"),
    rejectReason: text("reject_reason"),
    statementId: uuid("statement_id"),
    maintenanceIssueId: uuid("maintenance_issue_id"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [
    index("owner_expense_property_date_idx").on(t.propertyId, t.date),
    index("owner_expense_state_idx").on(t.orgId, t.state),
  ],
);

/**
 * Immutable once sent (INV-13, trigger in 0013). Disputes are a flag, not a state
 * (ADR-0003). `totals`, `segments` and `input_hash` are what `computeStatement`
 * returned; the lines are the argument (STMT-1).
 */
export const ownerStatement = pgTable(
  "owner_statement",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owner.id),
    agreementKey: uuid("agreement_key").notNull(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    /** Exclusive. */
    periodTo: date("period_to", { mode: "string" }).notNull(),
    state: text("state").notNull().default("draft"), // draft|approved|sent|paid|void
    disputeState: text("dispute_state").notNull().default("none"), // none|open|resolved
    disputeThreadId: uuid("dispute_thread_id"),
    currency: text("currency").notNull(),
    totals: jsonb("totals").notNull().$type<Record<string, number>>(),
    segments: jsonb("segments").notNull().default([]).$type<unknown[]>(),
    warnings: jsonb("warnings").notNull().default([]).$type<string[]>(),
    anomalies: jsonb("anomalies").notNull().default([]).$type<string[]>(),
    inputHash: text("input_hash").notNull(),
    generatedAt: ts("generated_at").notNull().default(now()),
    approvedBy: uuid("approved_by"),
    approvedAt: ts("approved_at"),
    sentAt: ts("sent_at"),
    paidAt: ts("paid_at"),
    pdfRef: text("pdf_ref"),
    previousStatementId: uuid("previous_statement_id"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [
    index("owner_statement_owner_idx").on(t.ownerId, t.periodFrom),
    index("owner_statement_state_idx").on(t.orgId, t.state),
    uniqueIndex("owner_statement_period_idx")
      .on(t.agreementKey, t.periodFrom)
      .where(sql`state <> 'void'`),
  ],
);

export const ownerStatementLine = pgTable(
  "owner_statement_line",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => ownerStatement.id),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    agreementVersion: integer("agreement_version").notNull(),
    bookingId: uuid("booking_id").references(() => booking.id),
    expenseId: uuid("expense_id"),
    blockId: uuid("block_id"),
    adjustmentId: text("adjustment_id"),
    basis: jsonb("basis").notNull().default({}).$type<Record<string, unknown>>(),
  },
  (t) => [uniqueIndex("owner_statement_line_seq_idx").on(t.statementId, t.seq)],
);

/**
 * The ledger of billed nights: a night appears on at most one live statement
 * (spec 17 §17.7). Keyed by booking and date, not by `booking_room` rows, which
 * every revision re-projects.
 */
export const ownerStatementNight = pgTable(
  "owner_statement_night",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => ownerStatement.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    /** Stable room identity within the booking (the booking id when rooms are aggregated). */
    roomKey: text("room_key").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.statementId, t.roomKey, t.date] }),
    uniqueIndex("owner_statement_night_once_idx").on(t.roomKey, t.date),
  ],
);

export const ownerPayout = pgTable(
  "owner_payout",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => ownerStatement.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owner.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(), // manual|stripe_connect|fake
    providerRef: text("provider_ref"),
    state: text("state").notNull().default("pending"), // pending|awaiting_approval|in_transit|paid|failed
    initiatedBy: uuid("initiated_by"),
    approvedBy: uuid("approved_by"),
    reference: text("reference"),
    failureReason: text("failure_reason"),
    paidAt: ts("paid_at"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [index("owner_payout_statement_idx").on(t.statementId)],
);
