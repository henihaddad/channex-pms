/**
 * API keys for the public API and the MCP server (spec 04 §4.7a, spec 02 §2.8). A key is
 * `otab_` plus at least 32 URL-safe random characters, shown once and stored as its SHA-256.
 * The first characters stay visible so a host can tell two keys apart in the list.
 */

export const API_KEY_PREFIX = "otab_";
/** `otab_` and seven characters: enough to tell keys apart, far too few to guess one. */
export const API_KEY_VISIBLE_LENGTH = 12;
const BODY = /^[A-Za-z0-9_-]{32,128}$/;

/** A key from random URL-safe characters (the crypto port's `randomToken`). */
export function formatApiKey(random: string): string {
  if (!BODY.test(random)) throw new RangeError("API key body must be 32+ URL-safe characters");
  return `${API_KEY_PREFIX}${random}`;
}

/** True for a string shaped like one of our keys. Says nothing about whether it exists. */
export function isApiKey(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(API_KEY_PREFIX) &&
    BODY.test(value.slice(API_KEY_PREFIX.length))
  );
}

/** What the key list shows: `otab_AbC12xY…`. */
export function apiKeyVisiblePrefix(secret: string): string {
  return secret.slice(0, API_KEY_VISIBLE_LENGTH);
}

/** The stored form. The secret itself is never written anywhere. */
export function hashApiKey(sha256Hex: (s: string) => string, secret: string): string {
  return sha256Hex(secret);
}

/**
 * The access levels a host picks from. Each is an explicit permission list (a service account
 * holds enumerated permissions, never a role: spec 02 §2.8), evaluated by the same engine as a
 * person's grant.
 */
export const API_KEY_ACCESS_LEVELS = ["full", "read_only", "messages", "prices"] as const;
export type ApiKeyAccess = (typeof API_KEY_ACCESS_LEVELS)[number];

export function isApiKeyAccess(value: unknown): value is ApiKeyAccess {
  return typeof value === "string" && (API_KEY_ACCESS_LEVELS as readonly string[]).includes(value);
}

/**
 * Never on a key, whatever the level: managing people, keys and the organization itself,
 * money going out, card data, channel credentials, door codes, deletions. These stay with a
 * person who can re-enter a password (a key cannot do step-up).
 */
export const NEVER_ON_A_KEY: ReadonlySet<string> = new Set([
  "api_key:read",
  "api_key:create",
  "api_key:revoke",
  "webhook:manage",
  "member:invite",
  "member:update_role",
  "member:remove",
  "role:manage_custom",
  "org:update",
  "org:delete",
  "org:transfer_ownership",
  "billing:manage",
  "impersonation:execute",
  "channel:read_credentials",
  "channel_account:manage",
  "channel:delete",
  "booking:read_payment_instrument",
  "payment:capture",
  "payment:refund",
  "payout:execute",
  "property:delete",
  "plugin:install",
  "plugin:configure",
  "access_credential:read",
  "access_credential:issue",
  "access_credential:revoke",
  "audit:read",
]);

const READ = /:(read|read_pii|read_financial)$/;

const MESSAGES = [
  "org:read",
  "property:read",
  "booking:read",
  "booking:read_pii",
  "channel:read",
  "message:read",
  "message:send",
  "message:close_thread",
  "template:read",
  "review:read",
  "review:respond",
];

const PRICES = [
  "org:read",
  "property:read",
  "room_type:read",
  "rate_plan:read",
  "unit:read",
  "booking:read",
  "channel:read",
  "ari:read",
  "ari:update_availability",
  "ari:update_rate",
  "ari:update_restriction",
  "ari:bulk_execute",
  "yield_rule:read",
];

/**
 * The permissions a key of this access level holds, drawn from the catalogue (passed in so
 * core stays free of the authz package). Sorted, deduplicated, never a `NEVER_ON_A_KEY` entry.
 */
export function apiKeyPermissions(level: ApiKeyAccess, catalogue: readonly string[]): string[] {
  const known = new Set(catalogue);
  const pick = (ps: Iterable<string>) =>
    [...new Set(ps)].filter((p) => known.has(p) && !NEVER_ON_A_KEY.has(p)).sort();
  switch (level) {
    case "full":
      return pick(catalogue);
    case "read_only":
      return pick(catalogue.filter((p) => READ.test(p)));
    case "messages":
      return pick(MESSAGES);
    case "prices":
      return pick(PRICES);
  }
}
