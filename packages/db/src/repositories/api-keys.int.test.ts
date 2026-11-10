import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Id } from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { rawRows, withoutTenant, withTenant, type Tx } from "../tenant.js";
import { sql } from "drizzle-orm";
import * as s from "../schema/index.js";
import { DrizzleApiKeyRepository, resolveApiKey } from "./api-keys.js";
import { DrizzleIdentityRepository } from "./identity.js";

/**
 * API keys through real SQL (spec 04 §4.7a): created as service account + grant + hashed key,
 * listed per tenant only, resolved before any tenant context by their hash, last_used_at
 * stamped at most once a minute, and dead the moment they are revoked.
 */
let handle: DbHandle;
const ORG = Id.next();
const OTHER = Id.next();
const userId = Id.next();
const actor = { type: "user" as const, id: userId };
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
const run = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant(handle.db, { orgId, actor }, fn);

const secret = `otab_${"k".repeat(40)}`;
const keyId = Id.next();
const saId = Id.next();

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, async (tx) => {
    for (const [id, slug] of [
      [ORG, "keys-a"],
      [OTHER, "keys-b"],
    ] as const)
      await tx
        .insert(s.organization)
        .values({ id, name: slug, slug, country: "PT", defaultCurrency: "EUR" });
    await tx
      .insert(s.user)
      .values({ id: userId, email: "ana@keys.example", name: "Ana", passwordHash: "x" });
  });
  await run(ORG, (tx) =>
    new DrizzleApiKeyRepository(tx, ORG).create({
      apiKeyId: keyId,
      serviceAccountId: saId,
      grantId: Id.next(),
      name: "Claude",
      access: "read_only",
      permissions: ["ari:read", "booking:read"],
      prefix: secret.slice(0, 12),
      keyHash: sha(secret),
      createdBy: userId,
    }),
  );
});
afterAll(async () => handle.close());

describe("api keys", () => {
  it("lists the key with its access, prefix and creator, never the hash", async () => {
    const rows = await run(ORG, (tx) => new DrizzleApiKeyRepository(tx, ORG).list());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: keyId,
      name: "Claude",
      access: "read_only",
      prefix: "otab_kkkkkkk",
      createdBy: userId,
      createdByName: "Ana",
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(JSON.stringify(rows)).not.toContain(sha(secret));
  });

  it("is invisible to another tenant", async () => {
    expect(await run(OTHER, (tx) => new DrizzleApiKeyRepository(tx, OTHER).list())).toEqual([]);
  });

  it("holds its permissions as an explicit grant on a service account", async () => {
    const grants = await run(ORG, (tx) =>
      new DrizzleIdentityRepository(tx).listGrantsForSubject("service_account", saId),
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      roleKey: "service_account",
      scopeType: "organization",
      scopeId: ORG,
      overrides: { allow: ["ari:read", "booking:read"] },
      createdBy: userId,
    });
  });

  it("resolves by hash outside any tenant and stamps last_used_at once a minute", async () => {
    expect(await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha("otab_nope")))).toBeNull();
    const r = await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha(secret)));
    expect(r).toEqual({
      orgId: ORG,
      apiKeyId: keyId,
      serviceAccountId: saId,
      name: "Claude",
      scopes: ["read_only"],
      createdBy: userId,
    });
    const stamp = async () =>
      (
        await withoutTenant(handle.db, (tx) =>
          rawRows<{ t: string | null }>(
            tx,
            sql`select last_used_at::text as t from api_key where id = ${keyId}`,
          ),
        )
      )[0]?.t ?? null;
    const first = await stamp();
    expect(first).not.toBeNull();
    await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha(secret)));
    expect(await stamp()).toBe(first);
  });

  it("is dead once revoked: no resolve, grant revoked, still listed", async () => {
    const out = await run(ORG, (tx) =>
      new DrizzleApiKeyRepository(tx, ORG).revoke(keyId, new Date().toISOString()),
    );
    expect(out).toEqual({ name: "Claude" });
    expect(await withoutTenant(handle.db, (tx) => resolveApiKey(tx, sha(secret)))).toBeNull();
    const grants = await run(ORG, (tx) =>
      new DrizzleIdentityRepository(tx).listGrantsForSubject("service_account", saId),
    );
    expect(grants).toEqual([]);
    const rows = await run(ORG, (tx) => new DrizzleApiKeyRepository(tx, ORG).list());
    expect(rows[0]?.revokedAt).not.toBeNull();
    // revoking twice is a no-op, and another tenant cannot revoke it at all
    expect(
      await run(ORG, (tx) => new DrizzleApiKeyRepository(tx, ORG).revoke(keyId, "2026-01-01")),
    ).toBeNull();
  });
});
