import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";
import { ratePlan } from "./inventory.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Org-level shared OTA credentials / OAuth tokens (spec 03 §3.4, CH-5). */
export const channelAccount = pgTable("channel_account", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  adapterCode: text("adapter_code").notNull(),
  label: text("label").notNull(),
  credentialsEnc: text("credentials_enc"),
  oauthTokensEnc: text("oauth_tokens_enc"),
  oauthExpiresAt: ts("oauth_expires_at"),
  state: text("state").notNull().default("active"), // active|expired|revoked
  createdAt: ts("created_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

export const channelConnection = pgTable(
  "channel_connection",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    channelAccountId: uuid("channel_account_id").references(() => channelAccount.id),
    adapterCode: text("adapter_code").notNull(),
    channexChannelId: text("channex_channel_id"),
    settings: jsonb("settings").notNull().default({}),
    settingsEnc: text("settings_enc"),
    state: text("state").notNull().default("draft"), // draft|testing|mapped|active|paused|error|removed
    readiness: jsonb("readiness")
      .notNull()
      .default({ ready: false, issues: [] })
      .$type<{ ready: boolean; issues: string[] }>(),
    lastError: text("last_error"),
    lastPushAt: ts("last_push_at"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("channel_connection_property_idx").on(t.propertyId)],
);

export const channelMapping = pgTable(
  "channel_mapping",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => channelConnection.id),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlan.id),
    otaRoomCode: text("ota_room_code").notNull(),
    otaRateCode: text("ota_rate_code").notNull(),
    occupancy: text("occupancy"),
    rateType: text("rate_type"),
    derivedOption: jsonb("derived_option"),
    status: text("status").notNull().default("active"),
  },
  (t) => [index("channel_mapping_connection_idx").on(t.connectionId)],
);

export const channelEvent = pgTable(
  "channel_event",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    connectionId: uuid("connection_id").references(() => channelConnection.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"), // info|p2|p1
    payload: jsonb("payload").notNull().default({}),
    message: text("message"),
    occurredAt: ts("occurred_at").notNull().default(now()),
    acknowledgedAt: ts("acknowledged_at"),
  },
  (t) => [index("channel_event_property_idx").on(t.propertyId, t.occurredAt)],
);
