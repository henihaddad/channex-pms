import { sql } from "drizzle-orm";
import {
  boolean,
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

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/** Global identity: a user may hold grants across organizations (spec 03 §3.2). */
export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    locale: text("locale").notNull().default("en"),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("user_email_unique").on(sql`lower(${t.email})`)],
);

/** The tenant boundary. Every other row is reachable from exactly one organization. */
export const organization = pgTable("organization", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country").notNull(),
  defaultCurrency: text("default_currency").notNull(),
  locale: text("locale").notNull().default("en"),
  settings: jsonb("settings").notNull().default({}),
  channexAccountRef: text("channex_account_ref"),
  planId: uuid("plan_id"),
  state: text("state").notNull().default("trial"),
  createdAt: ts("created_at").notNull().default(now()),
  updatedAt: ts("updated_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

/** Per-tenant data-encryption key, wrapped by the master key (PRIV-1). */
export const orgKey = pgTable("org_key", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  version: integer("version").notNull().default(1),
  wrappedDek: text("wrapped_dek").notNull(),
  createdAt: ts("created_at").notNull().default(now()),
});

export const propertyGroup = pgTable(
  "property_group",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("portfolio"), // portfolio|building|city|owner|brand
    channexGroupId: text("channex_group_id"),
    createdAt: ts("created_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("property_group_org_idx").on(t.orgId)],
);

export const property = pgTable(
  "property",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    kind: text("kind").notNull(), // single_unit|multi_unit|hotel
    title: text("title").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    state: text("state").notNull().default("draft"), // draft|syncing|live|suspended|archived
    channexPropertyId: text("channex_property_id"),
    /** High-entropy path token for the webhook receiver (spec 05 §5.5.1); rotatable. */
    webhookToken: text("webhook_token").unique(),
    webhookSecretEnc: text("webhook_secret_enc"),
    address: jsonb("address").notNull().default({}),
    settings: jsonb("settings").notNull().default({}),
    createdAt: ts("created_at").notNull().default(now()),
    updatedAt: ts("updated_at").notNull().default(now()),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("property_org_idx").on(t.orgId)],
);

/** Many-to-many: a property may sit in a city group and an owner group (spec 02 §2.1). */
export const propertyGroupMembership = pgTable(
  "property_group_membership",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => propertyGroup.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.propertyId] })],
);

export const customRole = pgTable("custom_role", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  permissions: jsonb("permissions").notNull().$type<string[]>(),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

/** grant = (subject, role, scope, overrides?, expires_at?) — spec 02 §2.1. */
export const grant = pgTable(
  "grant",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    subjectType: text("subject_type").notNull(), // user|service_account|invitation
    subjectId: uuid("subject_id").notNull(),
    roleKey: text("role_key"),
    customRoleId: uuid("custom_role_id").references(() => customRole.id),
    scopeType: text("scope_type").notNull(), // organization|group|property
    scopeId: uuid("scope_id").notNull(),
    overrides: jsonb("overrides").$type<{ allow?: string[]; deny?: string[] }>(),
    expiresAt: ts("expires_at"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().default(now()),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("grant_subject_idx").on(t.orgId, t.subjectType, t.subjectId)],
);

export const invitation = pgTable("invitation", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  email: text("email").notNull(),
  intendedGrant: jsonb("intended_grant").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().default(now()),
});

/** Refresh-token sessions; access tokens are short-lived and stateless (spec 02 §2.6). */
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    refreshHash: text("refresh_hash").notNull(),
    deviceFingerprint: text("device_fingerprint").notNull(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().default(now()),
    stepUpAt: ts("step_up_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const magicLink = pgTable("magic_link", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(), // login|invite|owner_portal|guest_portal
  tokenHash: text("token_hash").notNull().unique(),
  payload: jsonb("payload").notNull().default({}),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().default(now()),
});

export const serviceAccount = pgTable("service_account", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  permissions: jsonb("permissions").notNull().$type<string[]>(),
  ipAllowlist: jsonb("ip_allowlist").$type<string[]>(),
  createdAt: ts("created_at").notNull().default(now()),
  archivedAt: ts("archived_at"),
});

export const apiKey = pgTable("api_key", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  serviceAccountId: uuid("service_account_id")
    .notNull()
    .references(() => serviceAccount.id),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: jsonb("scopes").notNull().$type<string[]>(),
  lastUsedAt: ts("last_used_at"),
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().default(now()),
});

/**
 * Global membership index: which organizations a user belongs to. Grants live
 * under RLS, so the org switcher and login need a cross-tenant lookup that does
 * not leak anything beyond "user X is a member of org Y".
 */
export const orgMembership = pgTable(
  "org_membership",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);
