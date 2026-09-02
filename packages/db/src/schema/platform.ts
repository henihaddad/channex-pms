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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Append-only, hash-chained per organization (spec 03 §3.9, spec 13 §13.1). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    seq: bigint("seq", { mode: "number" }).notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    actor: jsonb("actor").notNull().$type<{ type: string; id: string; impersonatedBy?: string }>(),
    action: text("action").notNull(),
    subject: jsonb("subject").notNull().$type<{ kind: string; id: string }>(),
    before: jsonb("before"),
    after: jsonb("after"),
    surface: text("surface").notNull(),
    ip: text("ip"),
    requestId: text("request_id"),
    occurredAt: ts("occurred_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("audit_log_org_seq_unique").on(t.orgId, t.seq),
    index("audit_log_subject_idx").on(t.orgId, t.action, t.occurredAt),
  ],
);

/** Transactional outbox: written in the same transaction as the change it describes. */
export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    type: text("type").notNull(),
    aggregate: jsonb("aggregate").notNull().$type<{ kind: string; id: string }>(),
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    requestId: text("request_id"),
    occurredAt: ts("occurred_at").notNull().default(now()),
    publishedAt: ts("published_at"),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [index("outbox_unpublished_idx").on(t.publishedAt, t.occurredAt)],
);

/** Consumer-side idempotency: (consumer, dedupe_key) processed exactly once. */
export const processedEvent = pgTable(
  "processed_event",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    consumer: text("consumer").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    processedAt: ts("processed_at").notNull().default(now()),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.dedupeKey] })],
);

/** Nightly on-the-books snapshot per (property, stay_date, snapshot_date) — spec 11 §11.5, Q14. */
export const otbSnapshot = pgTable(
  "otb_snapshot",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    stayDate: date("stay_date", { mode: "string" }).notNull(),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    roomsAvailable: integer("rooms_available").notNull(),
    roomsSold: integer("rooms_sold").notNull(),
    roomRevenueMinor: bigint("room_revenue_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.stayDate, t.snapshotDate] })],
);
