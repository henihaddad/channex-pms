import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, serviceAccount, user } from "./identity.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const now = () => sql`now()`;

/**
 * "Sign in with OTAbridge" for MCP clients (spec 04 §4.7b). A client registers itself
 * (RFC 7591), a person approves it for one organization at an access level, which creates a
 * service account and its grant exactly like an API key; the client then trades a code for an
 * access token (an `api_key` row with an expiry) and a rotating refresh token.
 */

/** A dynamically registered client. Global: registration happens before anyone signs in. */
export const oauthClient = pgTable(
  "oauth_client",
  {
    id: uuid("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    /** SHA-256 of the secret, for a client that registered as confidential; null for a public client. */
    clientSecretHash: text("client_secret_hash"),
    clientName: text("client_name").notNull(),
    redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
    grantTypes: jsonb("grant_types").notNull().$type<string[]>(),
    clientUri: text("client_uri"),
    scope: text("scope"),
    /** Where the registration came from, for the per-address cap. */
    registeredIp: text("registered_ip"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("oauth_client_ip_idx").on(t.registeredIp, t.createdAt)],
);

/**
 * A person's consent: this client acts in this organization as this service account, at this
 * access level. Tenant data under RLS; Settings → API & AI lists it as a connected app.
 */
export const oauthGrant = pgTable(
  "oauth_grant",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .unique()
      .references(() => serviceAccount.id),
    access: text("access").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    createdBy: uuid("created_by").references(() => user.id),
    createdAt: ts("created_at").notNull().default(now()),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("oauth_grant_org_idx").on(t.orgId)],
);

/**
 * Single-use authorization codes, hashed. Global: the token endpoint finds one by its hash
 * before any tenant context exists, and learns the organization from it.
 */
export const oauthCode = pgTable("oauth_code", {
  id: uuid("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => oauthGrant.id),
  orgId: uuid("org_id").notNull(),
  serviceAccountId: uuid("service_account_id").notNull(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().default(now()),
});

/** Rotating refresh tokens, hashed; global for the same reason as codes. */
export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => oauthGrant.id),
    orgId: uuid("org_id").notNull(),
    serviceAccountId: uuid("service_account_id").notNull(),
    clientId: text("client_id").notNull(),
    resource: text("resource").notNull(),
    expiresAt: ts("expires_at").notNull(),
    rotatedAt: ts("rotated_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().default(now()),
  },
  (t) => [index("oauth_refresh_token_grant_idx").on(t.grantId)],
);
