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
import { organization, user } from "./identity.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Spec 12 §12.5 plan catalogue. Global: the operator edits it, tenants read it. */
export const plan = pgTable("plan", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  tiers: jsonb("tiers").notNull().$type<Array<{ fromUnits: number; unitMinor: number }>>(),
  addOns: jsonb("add_ons")
    .notNull()
    .default([])
    .$type<Array<{ key: string; name: string; monthlyMinor: number }>>(),
  annualDiscountBps: integer("annual_discount_bps").notNull().default(0),
  quotas: jsonb("quotas").notNull().$type<Record<string, number | null>>(),
  trialDays: integer("trial_days").notNull().default(14),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().default(now()),
});

/** One subscription per organization (hosted mode only; absent when self-hosted). */
export const subscription = pgTable("subscription", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organization.id),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plan.id),
  annual: boolean("annual").notNull().default(false),
  addOns: jsonb("add_ons").notNull().default([]).$type<string[]>(),
  customerRef: text("customer_ref"),
  paymentMethod: jsonb("payment_method").$type<{
    methodRef: string;
    brand: string;
    last4: string;
  }>(),
  billingEmail: text("billing_email"),
  billingName: text("billing_name"),
  vatId: text("vat_id"),
  country: text("country").notNull(),
  periodFrom: date("period_from", { mode: "string" }).notNull(),
  periodTo: date("period_to", { mode: "string" }).notNull(),
  trialEndsOn: date("trial_ends_on", { mode: "string" }),
  /** Dunning (§12.5): when the last charge failed and how many retries ran. */
  paymentFailedOn: date("payment_failed_on", { mode: "string" }),
  dunningRetries: integer("dunning_retries").notNull().default(0),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: ts("updated_at").notNull().default(now()),
});

/** Nightly metering (§12.5): billed on the period peak. */
export const usageRecord = pgTable(
  "usage_record",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    date: date("date", { mode: "string" }).notNull(),
    activeUnits: integer("active_units").notNull(),
    properties: integer("properties").notNull(),
    rooms: integer("rooms").notNull().default(0),
    users: integer("users").notNull(),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("usage_record_org_date_idx").on(t.orgId, t.date)],
);

/** Invoices as issued (BILL-2): the draft is kept so every line is explainable later. */
export const billingInvoice = pgTable(
  "billing_invoice",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    draft: jsonb("draft").notNull().$type<Record<string, unknown>>(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    vatMinor: integer("vat_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    state: text("state").notNull().default("open"), // draft|open|paid|uncollectible|void
    providerRef: text("provider_ref"),
    pdfUrl: text("pdf_url"),
    failureReason: text("failure_reason"),
    issuedAt: ts("issued_at").notNull().default(now()),
    paidAt: ts("paid_at"),
  },
  (t) => [uniqueIndex("billing_invoice_org_period_idx").on(t.orgId, t.periodFrom)],
);

/** Operator accounts (spec 02 §2.7 `platform_operator`): outside tenancy, every action audited twice. */
export const platformOperator = pgTable("platform_operator", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id),
  grantedBy: uuid("granted_by"),
  createdAt: ts("created_at").notNull().default(now()),
});

/** Operator audit (§12.1): the tenant's own log gets a copy through the ordinary audit writer. */
export const operatorAuditLog = pgTable(
  "operator_audit_log",
  {
    id: uuid("id").primaryKey(),
    operatorId: uuid("operator_id").notNull(),
    orgId: uuid("org_id"),
    action: text("action").notNull(),
    subject: jsonb("subject").notNull().$type<{ kind: string; id: string }>(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    requestId: text("request_id"),
    occurredAt: ts("occurred_at").notNull().default(now()),
  },
  (t) => [index("operator_audit_org_idx").on(t.orgId, t.occurredAt)],
);

/** Feature flags (§12.1): per tenant or percentage rollout, never a paywall. */
export const featureFlag = pgTable(
  "feature_flag",
  {
    id: uuid("id").primaryKey(),
    key: text("key").notNull(),
    /** Null = platform-wide default; a row with an org overrides it. */
    orgId: uuid("org_id"),
    enabled: boolean("enabled").notNull().default(false),
    rolloutPercent: integer("rollout_percent").notNull().default(0),
    updatedBy: uuid("updated_by"),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("feature_flag_key_org_idx").on(t.key, t.orgId)],
);

/** In-app banners for maintenance and incidents (§12.1), targetable by tenant. */
export const announcement = pgTable("announcement", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  level: text("level").notNull().default("info"), // info|warning|incident
  orgId: uuid("org_id"),
  startsAt: ts("starts_at").notNull().default(now()),
  endsAt: ts("ends_at"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().default(now()),
});

/** Impersonation (spec 02 §2.7): requested, approved, capped, redacted, banner shown, transcript kept. */
export const impersonationSession = pgTable(
  "impersonation_session",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    operatorId: uuid("operator_id").notNull(),
    reason: text("reason").notNull(),
    state: text("state").notNull().default("requested"), // requested|approved|active|ended|denied
    writeApproved: boolean("write_approved").notNull().default(false),
    breakGlass: boolean("break_glass").notNull().default(false),
    secondOperatorId: uuid("second_operator_id"),
    approvedBy: uuid("approved_by"),
    approvedAt: ts("approved_at"),
    startedAt: ts("started_at"),
    expiresAt: ts("expires_at"),
    endedAt: ts("ended_at"),
    transcript: jsonb("transcript")
      .notNull()
      .default([])
      .$type<Array<{ at: string; action: string; subject: string }>>(),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("impersonation_org_idx").on(t.orgId, t.state)],
);

/** Time-boxed, pre-granted support access (spec 02 §2.7 step 2). */
export const supportAccessGrant = pgTable("support_access_grant", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organization.id),
  grantedBy: uuid("granted_by").notNull(),
  writeAllowed: boolean("write_allowed").notNull().default(false),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().default(now()),
});

/** Installed plugins (§12.7, ADR-0004): out-of-process webhooks with a scoped secret. */
export const plugin = pgTable(
  "plugin",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    key: text("key").notNull(),
    manifest: jsonb("manifest").notNull().$type<Record<string, unknown>>(),
    endpointUrl: text("endpoint_url").notNull(),
    secretEnc: text("secret_enc").notNull(),
    config: jsonb("config").notNull().default({}).$type<Record<string, unknown>>(),
    enabled: boolean("enabled").notNull().default(true),
    /** Outbox cursor: the last event (by occurred_at, id) handed to this plugin. */
    cursorAt: ts("cursor_at"),
    cursorId: uuid("cursor_id"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    breakerOpenUntil: ts("breaker_open_until"),
    installedBy: uuid("installed_by"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("plugin_org_key_idx").on(t.orgId, t.key)],
);

export const pluginDelivery = pgTable(
  "plugin_delivery",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    pluginId: uuid("plugin_id")
      .notNull()
      .references(() => plugin.id),
    eventId: uuid("event_id").notNull(),
    eventType: text("event_type").notNull(),
    attempts: integer("attempts").notNull().default(0),
    state: text("state").notNull().default("pending"), // pending|delivered|failed|dead
    nextAttemptAt: ts("next_attempt_at").notNull().default(now()),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    deliveredAt: ts("delivered_at"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("plugin_delivery_event_idx").on(t.pluginId, t.eventId),
    index("plugin_delivery_due_idx").on(t.state, t.nextAttemptAt),
  ],
);

/** Offboarding (§12.3): a full export the tenant can take unaided; purge after the grace period. */
export const dataExport = pgTable("data_export", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  requestedBy: uuid("requested_by"),
  state: text("state").notNull().default("requested"), // requested|ready|failed|expired
  bundle: text("bundle"),
  bytes: integer("bytes"),
  counts: jsonb("counts").$type<Record<string, number>>(),
  readyAt: ts("ready_at"),
  expiresAt: ts("expires_at"),
  createdAt: ts("created_at").notNull().default(now()),
});

/** Operator-triggered jobs (§12.1) travel through a table so the console needs no queue connection. */
export const platformJobRequest = pgTable("platform_job_request", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull(),
  orgId: uuid("org_id"),
  args: jsonb("args").notNull().default({}).$type<Record<string, unknown>>(),
  requestedBy: uuid("requested_by"),
  state: text("state").notNull().default("requested"), // requested|running|done|failed
  result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: ts("created_at").notNull().default(now()),
  finishedAt: ts("finished_at"),
});
