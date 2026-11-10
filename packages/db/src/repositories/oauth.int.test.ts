import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Id } from "@pms/core";
import { sql } from "drizzle-orm";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { rawRows, withoutTenant, withTenant, type Tx } from "../tenant.js";
import * as s from "../schema/index.js";
import { DrizzleApiKeyRepository, resolveApiKey } from "./api-keys.js";
import { DrizzleIdentityRepository } from "./identity.js";
import { DrizzleOAuthGrantRepository, DrizzleOAuthStore } from "./oauth.js";

/**
 * MCP sign-in storage through real SQL (spec 04 §4.7b): a registered client, a consent that
 * creates a service account like an API key, a code consumed exactly once, an access token
 * the API key resolver accepts until it expires, rotating refresh tokens, the consent hidden
 * from other tenants, and a disconnect that kills everything at once.
 */
let handle: DbHandle;
const ORG = Id.next();
const OTHER = Id.next();
const userId = Id.next();
const actor = { type: "user" as const, id: userId };
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
const run = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant(handle.db, { orgId, actor }, fn);
const global = <T>(fn: (store: DrizzleOAuthStore) => Promise<T>) =>
  withoutTenant(handle.db, (tx) => fn(new DrizzleOAuthStore(tx)));

const CLIENT = "otab_client_test";
const RESOURCE = "https://app.example.com/api/mcp";
const grantId = Id.next();
const saId = Id.next();
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, async (tx) => {
    for (const [id, slug] of [
      [ORG, "oauth-a"],
      [OTHER, "oauth-b"],
    ] as const)
      await tx
        .insert(s.organization)
        .values({ id, name: slug, slug, country: "PT", defaultCurrency: "EUR" });
    await tx
      .insert(s.user)
      .values({ id: userId, email: "ana@oauth.example", name: "Ana", passwordHash: "x" });
  });
});
afterAll(async () => handle.close());

describe("oauth clients", () => {
  it("registers, finds by client_id, and counts registrations per address", async () => {
    await global((st) =>
      st.registerClient({
        id: Id.next(),
        clientId: CLIENT,
        clientSecretHash: null,
        clientName: "Claude",
        redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        clientUri: null,
        scope: "claudeai",
        registeredIp: "203.0.113.9",
      }),
    );
    const c = await global((st) => st.findClient(CLIENT));
    expect(c).toMatchObject({
      clientName: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      tokenEndpointAuthMethod: "none",
    });
    expect(await global((st) => st.findClient("nope"))).toBeNull();
    expect(await global((st) => st.registrationsSince("203.0.113.9", iso(-3600_000)))).toBe(1);
    expect(await global((st) => st.registrationsSince("198.51.100.1", iso(-3600_000)))).toBe(0);
  });
});

describe("a connection", () => {
  it("approving creates a service account with an explicit grant and a consent row", async () => {
    await run(ORG, (tx) =>
      new DrizzleOAuthGrantRepository(tx, ORG).create({
        grantId,
        serviceAccountId: saId,
        authzGrantId: Id.next(),
        name: "Claude (claude.ai)",
        clientId: CLIENT,
        access: "read_only",
        permissions: ["ari:read", "booking:read"],
        scope: "mcp",
        resource: RESOURCE,
        createdBy: userId,
      }),
    );
    const grants = await run(ORG, (tx) =>
      new DrizzleIdentityRepository(tx).listGrantsForSubject("service_account", saId),
    );
    expect(grants[0]).toMatchObject({
      roleKey: "service_account",
      overrides: { allow: ["ari:read", "booking:read"] },
    });
    const apps = await run(ORG, (tx) => new DrizzleOAuthGrantRepository(tx, ORG).list());
    expect(apps).toEqual([
      expect.objectContaining({
        grantId,
        name: "Claude (claude.ai)",
        clientName: "Claude",
        access: "read_only",
        lastUsedAt: null,
        createdByName: "Ana",
      }),
    ]);
  });

  it("is invisible to another tenant", async () => {
    expect(await run(OTHER, (tx) => new DrizzleOAuthGrantRepository(tx, OTHER).list())).toEqual([]);
    expect(
      await run(OTHER, (tx) => new DrizzleOAuthGrantRepository(tx, OTHER).findLive(grantId)),
    ).toBeNull();
    expect(
      await run(OTHER, (tx) => new DrizzleOAuthGrantRepository(tx, OTHER).revoke(grantId, iso(0))),
    ).toBeNull();
  });

  it("a code is consumed exactly once; the second presentation is seen as a replay", async () => {
    await run(ORG, (tx) =>
      new DrizzleOAuthStore(tx).insertCode({
        id: Id.next(),
        codeHash: sha("code-1"),
        grantId,
        orgId: ORG,
        serviceAccountId: saId,
        clientId: CLIENT,
        redirectUri: "http://127.0.0.1:9999/callback",
        codeChallenge: "c".repeat(43),
        resource: RESOURCE,
        expiresAt: iso(300_000),
      }),
    );
    const first = await global((st) => st.consumeCode(sha("code-1"), iso(0)));
    expect(first?.firstUse).toBe(true);
    expect(first?.code).toMatchObject({ grantId, orgId: ORG, serviceAccountId: saId });
    const second = await global((st) => st.consumeCode(sha("code-1"), iso(0)));
    expect(second?.firstUse).toBe(false);
    expect(await global((st) => st.consumeCode(sha("never-issued"), iso(0)))).toBeNull();
  });

  it("an access token resolves like an API key until it expires, and is not listed as a key", async () => {
    const live = "otab_oat_" + "a".repeat(40);
    const stale = "otab_oat_" + "b".repeat(40);
    for (const [secret, expiresAt] of [
      [stale, iso(-1000)],
      [live, iso(3600_000)],
    ] as const)
      await run(ORG, (tx) =>
        new DrizzleOAuthGrantRepository(tx, ORG).issueAccessToken({
          apiKeyId: Id.next(),
          serviceAccountId: saId,
          access: "read_only",
          prefix: secret.slice(0, 12),
          keyHash: sha(secret),
          expiresAt,
          now: iso(-2000),
        }),
      );
    const r = await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha(live)));
    expect(r).toMatchObject({ orgId: ORG, serviceAccountId: saId, name: "Claude (claude.ai)" });
    expect(await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha(stale)))).toBeNull();
    expect(await run(ORG, (tx) => new DrizzleApiKeyRepository(tx, ORG).list())).toEqual([]);
    const apps = await run(ORG, (tx) => new DrizzleOAuthGrantRepository(tx, ORG).list());
    expect(apps[0]?.lastUsedAt).not.toBeNull();
    // issuing the next token clears the expired one
    await run(ORG, (tx) =>
      new DrizzleOAuthGrantRepository(tx, ORG).issueAccessToken({
        apiKeyId: Id.next(),
        serviceAccountId: saId,
        access: "read_only",
        prefix: "otab_oat_ccc",
        keyHash: sha("otab_oat_" + "c".repeat(40)),
        expiresAt: iso(3600_000),
        now: iso(0),
      }),
    );
    const [{ n }] = (await run(ORG, (tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from api_key where service_account_id = ${saId}`,
      ),
    )) as [{ n: number }];
    expect(n).toBe(2);
  });

  it("a refresh token rotates once", async () => {
    const id = Id.next();
    await run(ORG, (tx) =>
      new DrizzleOAuthStore(tx).insertRefreshToken({
        id,
        tokenHash: sha("refresh-1"),
        grantId,
        orgId: ORG,
        serviceAccountId: saId,
        clientId: CLIENT,
        resource: RESOURCE,
        expiresAt: iso(86_400_000),
      }),
    );
    const found = await global((st) => st.findRefreshToken(sha("refresh-1")));
    expect(found).toMatchObject({ id, grantId, orgId: ORG, rotatedAt: null, revokedAt: null });
    expect(await global((st) => st.rotateRefreshToken(id, iso(0)))).toBe(true);
    expect(await global((st) => st.rotateRefreshToken(id, iso(0)))).toBe(false);
    expect((await global((st) => st.findRefreshToken(sha("refresh-1"))))?.rotatedAt).not.toBeNull();
  });

  it("disconnecting revokes the consent, the service account, every token at once", async () => {
    const live = "otab_oat_" + "a".repeat(40);
    expect(
      await run(ORG, (tx) => new DrizzleOAuthGrantRepository(tx, ORG).revoke(grantId, iso(0))),
    ).toEqual({ name: "Claude (claude.ai)" });
    expect(await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha(live)))).toBeNull();
    expect(await run(ORG, (tx) => new DrizzleOAuthGrantRepository(tx, ORG).list())).toEqual([]);
    expect(
      await run(ORG, (tx) => new DrizzleOAuthGrantRepository(tx, ORG).findLive(grantId)),
    ).toBeNull();
    const rows = await withoutTenant(handle.db, (tx) =>
      rawRows<{ revoked: number }>(
        tx,
        sql`select count(*)::int as revoked from oauth_refresh_token where grant_id = ${grantId} and revoked_at is not null`,
      ),
    );
    expect(rows[0]?.revoked).toBe(1);
    expect(
      await run(ORG, (tx) =>
        new DrizzleIdentityRepository(tx).listGrantsForSubject("service_account", saId),
      ),
    ).toEqual([]);
    // twice is a no-op
    expect(
      await run(ORG, (tx) => new DrizzleOAuthGrantRepository(tx, ORG).revoke(grantId, iso(0))),
    ).toBeNull();
  });
});
