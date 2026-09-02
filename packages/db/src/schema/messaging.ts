import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, property, user } from "./identity.js";
import { booking, guest } from "./reservations.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** One conversation with one guest on one channel (spec 09 §9.1). Bodies live on `message`. */
export const messageThread = pgTable(
  "message_thread",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    /** Channex thread id, or `booking:<channex booking id>` until the provider opens one. */
    providerThreadId: text("provider_thread_id").notNull(),
    provider: text("provider").notNull(), // booking_com|airbnb|expedia|direct|…
    bookingId: uuid("booking_id").references(() => booking.id),
    guestId: uuid("guest_id").references(() => guest.id),
    kind: text("kind").notNull().default("booking"), // booking|inquiry
    state: text("state").notNull().default("open"), // open|closed|no_reply_needed
    stateReason: text("state_reason"),
    guestNameEnc: text("guest_name_enc"),
    guestLanguage: text("guest_language"),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: ts("last_message_at"),
    lastInboundAt: ts("last_inbound_at"),
    lastOutboundAt: ts("last_outbound_at"),
    firstResponseDueAt: ts("first_response_due_at"),
    /** Set when the SLA clock stops; a later inbound restarts it (KPI source). */
    firstResponseAt: ts("first_response_at"),
    assigneeId: uuid("assignee_id").references(() => user.id),
    snoozedUntil: ts("snoozed_until"),
    tags: jsonb("tags").notNull().default([]).$type<string[]>(),
    /** AUTO-3: a guest replied after the last automated message; cleared when a human answers or closes. */
    automationHandover: boolean("automation_handover").notNull().default(false),
    providerUpdatedAt: ts("provider_updated_at"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("message_thread_provider_idx").on(t.propertyId, t.providerThreadId),
    index("message_thread_inbox_idx").on(t.orgId, t.state, t.lastInboundAt),
    index("message_thread_booking_idx").on(t.bookingId),
  ],
);

/**
 * Guest messages and internal notes share the timeline but not the shape (MSG-6):
 * a `note` row has no direction and no delivery state, enforced by a CHECK in
 * migration 0011, so nothing that delivers can even select it.
 */
export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messageThread.id),
    kind: text("kind").notNull(), // guest_message|note
    direction: text("direction"), // inbound|outbound (guest messages only)
    authorType: text("author_type").notNull(), // guest|staff|system|automation
    authorId: uuid("author_id"),
    bodyEnc: text("body_enc").notNull(),
    providerMessageId: text("provider_message_id"),
    deliveryState: text("delivery_state"), // queued|sent|failed|received (guest messages only)
    deliveryError: text("delivery_error"),
    attempts: integer("attempts").notNull().default(0),
    templateId: uuid("template_id"),
    automationRuleId: uuid("automation_rule_id"),
    automationRuleVersion: integer("automation_rule_version"),
    automationRuleName: text("automation_rule_name"),
    sentAt: ts("sent_at").notNull(),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("message_provider_idx").on(t.threadId, t.providerMessageId),
    index("message_thread_time_idx").on(t.threadId, t.sentAt),
    index("message_delivery_idx").on(t.orgId, t.deliveryState),
  ],
);

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messageThread.id),
    messageId: uuid("message_id").references(() => message.id),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Object-store key; inline `data:` until the storage port lands. */
    storageRef: text("storage_ref").notNull(),
    providerRef: text("provider_ref"),
    scanState: text("scan_state").notNull().default("pending"), // pending|clean|blocked
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("attachment_thread_idx").on(t.threadId)],
);

/** Org-scoped templates with locale variants (spec 09 §9.3); not PII. */
export const messageTemplate = pgTable(
  "message_template",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    category: text("category").notNull().default("general"),
    locale: text("locale").notNull().default("en"),
    channelScope: jsonb("channel_scope").$type<string[] | null>(),
    body: text("body").notNull(),
    /** AUTO-7 warnings raised by the editor, kept so the list can flag them. */
    warnings: jsonb("warnings").notNull().default([]).$type<string[]>(),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [uniqueIndex("message_template_name_idx").on(t.orgId, t.name, t.locale)],
);

/** Rules over triggers (spec 09 §9.5). Every change bumps `version`; runs record the version they used (AUTO-4). */
export const automationRule = pgTable(
  "automation_rule",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    trigger: text("trigger").notNull(),
    offsetDays: integer("offset_days"),
    atLocalTime: text("at_local_time"),
    conditions: jsonb("conditions").notNull().default({}).$type<Record<string, unknown>>(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => messageTemplate.id),
    quietFrom: text("quiet_from"),
    quietTo: text("quiet_to"),
    enabled: boolean("enabled").notNull().default(false),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [index("automation_rule_org_idx").on(t.orgId, t.enabled)],
);

/** One row per (rule, booking, anchor): the idempotency record and the audit of why a rule did or did not send. */
export const automationRun = pgTable(
  "automation_run",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRule.id),
    ruleVersion: integer("rule_version").notNull(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    bookingId: uuid("booking_id").references(() => booking.id),
    threadId: uuid("thread_id").references(() => messageThread.id),
    dedupeKey: text("dedupe_key").notNull(),
    state: text("state").notNull(), // sent|skipped|failed
    reason: text("reason"),
    scheduledFor: ts("scheduled_for"),
    executedAt: ts("executed_at").notNull().default(now()),
    messageId: uuid("message_id"),
  },
  (t) => [
    uniqueIndex("automation_run_dedupe_idx").on(t.orgId, t.dedupeKey),
    index("automation_run_booking_idx").on(t.bookingId),
  ],
);

/** OTA reviews and our responses (spec 09 §9.7). Review text is public on the OTA; the guest name is not. */
export const review = pgTable(
  "review",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    providerReviewId: text("provider_review_id").notNull(),
    bookingId: uuid("booking_id").references(() => booking.id),
    ota: text("ota").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    guestNameEnc: text("guest_name_enc"),
    insertedAt: ts("inserted_at").notNull(),
    canRespond: boolean("can_respond").notNull().default(true),
    responseState: text("response_state").notNull().default("pending"), // pending|queued|responded|failed|not_supported
    responseDueAt: ts("response_due_at"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("review_provider_idx").on(t.propertyId, t.providerReviewId),
    index("review_org_idx").on(t.orgId, t.responseState, t.insertedAt),
  ],
);

export const reviewResponse = pgTable(
  "review_response",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => review.id),
    body: text("body").notNull(),
    authorId: uuid("author_id"),
    deliveryState: text("delivery_state").notNull().default("queued"), // queued|sent|failed
    deliveryError: text("delivery_error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: ts("created_at").notNull().default(now()),
    sentAt: ts("sent_at"),
  },
  (t) => [index("review_response_review_idx").on(t.reviewId)],
);
