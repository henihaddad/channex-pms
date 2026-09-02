import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeClock, Id, IdentityService, type DomainEvent } from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { asSystem, withoutTenant, withTenant } from "../tenant.js";
import { DrizzleAuditWriter } from "./audit.js";
import { DrizzleIdentityRepository } from "./identity.js";
import { claimEvent, drainOutbox, enqueueOutbox, pendingOutboxCount } from "./outbox.js";
import * as s from "../schema/index.js";

let handle: DbHandle;
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
const ORG = Id.next();
const actor = { type: "user" as const, id: Id.next() };

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(s.organization)
      .values({ id: ORG, name: "Org", slug: "org", country: "PT", defaultCurrency: "EUR" }),
  );
});
afterAll(() => handle.close());

describe("audit writer", () => {
  it("chains entries per org and verifies; a tampered row breaks verification", async () => {
    await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
      const w = new DrizzleAuditWriter(tx, sha);
      for (let i = 0; i < 5; i++) {
        await w.append({
          orgId: ORG,
          actor,
          action: `test.${String(i)}`,
          subject: { kind: "x", id: String(i) },
          surface: "test",
          occurredAt: "2026-09-02T00:00:00Z",
        });
      }
      expect(await w.verify(ORG)).toEqual({ ok: true, checked: 5 });
    });
    // tamper as the owner role (bypassing pms_app's revoked privileges) — the trigger still fires
    await expect(
      handle.db.execute(`update audit_log set action = 'x' where seq = 3`),
    ).rejects.toThrow();
    // disable trigger to simulate a DBA edit, then verify detects it
    await handle.db.execute(`alter table audit_log disable trigger audit_log_no_update`);
    await handle.db.execute(`update audit_log set action = 'tampered' where seq = 3`);
    await handle.db.execute(`alter table audit_log enable trigger audit_log_no_update`);
    await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
      expect(await new DrizzleAuditWriter(tx, sha).verify(ORG)).toMatchObject({
        ok: false,
        brokenAtSeq: 3,
      });
    });
  });

  it("concurrent appenders keep a valid chain", async () => {
    const org2 = Id.next();
    await withoutTenant(handle.db, (tx) =>
      tx
        .insert(s.organization)
        .values({ id: org2, name: "O2", slug: "o2", country: "PT", defaultCurrency: "EUR" }),
    );
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        withTenant(handle.db, { orgId: org2, actor }, (tx) =>
          new DrizzleAuditWriter(tx, sha).append({
            orgId: org2,
            actor,
            action: `c.${String(i)}`,
            subject: { kind: "x", id: "1" },
            surface: "test",
            occurredAt: "2026-09-02T00:00:00Z",
          }),
        ),
      ),
    );
    await withTenant(handle.db, { orgId: org2, actor }, async (tx) => {
      expect(await new DrizzleAuditWriter(tx, sha).verify(org2)).toEqual({ ok: true, checked: 8 });
    });
  });
});

describe("outbox", () => {
  it("publishes once, survives a crash between publish and mark, and consumers claim exactly once", async () => {
    const ev: Omit<DomainEvent, "id"> = {
      orgId: ORG,
      type: "test.happened",
      aggregate: { kind: "x", id: Id.next() },
      payload: { n: 1 },
      occurredAt: "2026-09-02T00:00:00Z",
      dedupeKey: "test:1",
    };
    await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
      await enqueueOutbox(tx, ev);
      await enqueueOutbox(tx, ev); // duplicate dedupe key is a no-op
      expect(await pendingOutboxCount(tx, ORG)).toBe(1);
    });
    const delivered: DomainEvent[] = [];
    // first attempt: publisher "crashes" after delivering
    await expect(
      drainOutbox(handle.db, {
        publish: async (e) => {
          delivered.push(e);
          throw new Error("crash");
        },
      }),
    ).resolves.toBe(0);
    // second attempt delivers again (at-least-once), mark succeeds
    expect(
      await drainOutbox(handle.db, {
        publish: async (e) => {
          delivered.push(e);
        },
      }),
    ).toBe(1);
    expect(delivered).toHaveLength(2);
    expect(
      await drainOutbox(handle.db, {
        publish: async () => {
          throw new Error("should not be called");
        },
      }),
    ).toBe(0);
    // consumer idempotency turns at-least-once into exactly-once effect
    const first = await asSystem(handle.db, ORG, (tx) =>
      claimEvent(tx, ORG, "availability", "test:1"),
    );
    const second = await asSystem(handle.db, ORG, (tx) =>
      claimEvent(tx, ORG, "availability", "test:1"),
    );
    expect([first, second]).toEqual([true, false]);
  });
});

describe("identity repository", () => {
  it("runs sign-up, invitation and acceptance end to end against the database", async () => {
    const clock = new FakeClock("2026-09-02T10:00:00Z");
    const hasher = {
      hash: async (p: string) => `h:${p}`,
      verify: async (h: string, p: string) => h === `h:${p}`,
    };
    const totp = { generateSecret: () => "S", uri: () => "otpauth://x", verify: () => true };
    const crypto = {
      randomToken: () => Id.next() + Id.next(),
      sha256Hex: sha,
      seal: async (p: string) => p,
      open: async (p: string) => p,
    };
    const mailer = { send: async () => {} };
    const orgId = Id.next();
    const svcFor = (tx: ConstructorParameters<typeof DrizzleIdentityRepository>[0]) =>
      new IdentityService({
        repo: new DrizzleIdentityRepository(tx),
        hasher,
        totp,
        crypto,
        mailer,
        clock,
      });

    const signup = await withTenant(
      handle.db,
      { orgId, actor: { type: "user", id: "signup" } },
      (tx) =>
        svcFor(tx).signUp({
          orgId,
          email: "ana@example.com",
          password: "correct horse battery",
          name: "Ana",
          organization: { name: "Coastal", slug: "coastal", country: "PT", defaultCurrency: "EUR" },
          deviceFingerprint: "d1",
        }),
    );
    if (!signup.ok) throw new Error(signup.error.message);
    const ana = signup.value.user;

    const login = await withoutTenant(handle.db, (tx) =>
      svcFor(tx).login("ana@example.com", "correct horse battery", "d1"),
    );
    expect(login.ok && login.value.kind).toBe("session");

    const invite = await withTenant(
      handle.db,
      { orgId, actor: { type: "user", id: ana.id } },
      (tx) =>
        svcFor(tx).invite({
          orgId,
          email: "bob@example.com",
          invitedBy: ana.id,
          locale: "en",
          orgName: "Coastal",
          grant: {
            roleKey: "property_manager",
            customRoleId: null,
            scopeType: "organization",
            scopeId: orgId,
            overrides: null,
            expiresAt: null,
          },
        }),
    );
    if (!invite.ok) throw new Error(invite.error.message);

    const accept = await withTenant(
      handle.db,
      { orgId, actor: { type: "user", id: "invitee" } },
      (tx) =>
        svcFor(tx).acceptInvitation(invite.value.token, {
          name: "Bob",
          password: "another strong password",
          deviceFingerprint: "d2",
        }),
    );
    expect(accept.ok).toBe(true);
    if (!accept.ok) return;

    const grants = await withTenant(
      handle.db,
      { orgId, actor: { type: "user", id: ana.id } },
      (tx) => new DrizzleIdentityRepository(tx).listGrantsForSubject("user", accept.value.user.id),
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ roleKey: "property_manager", scopeType: "organization" });

    // Bob's grant is invisible from another tenant
    const other = Id.next();
    await withoutTenant(handle.db, (tx) =>
      tx
        .insert(s.organization)
        .values({ id: other, name: "Other", slug: "other", country: "TN", defaultCurrency: "TND" }),
    );
    const foreign = await withTenant(handle.db, { orgId: other, actor }, (tx) =>
      new DrizzleIdentityRepository(tx).listGrantsForSubject("user", accept.value.user.id),
    );
    expect(foreign).toEqual([]);

    // refresh rotation works through the real session table
    const r = await withoutTenant(handle.db, (tx) =>
      svcFor(tx).refresh(accept.value.tokens.refreshToken, "d2"),
    );
    expect(r.ok).toBe(true);
    const reuse = await withoutTenant(handle.db, (tx) =>
      svcFor(tx).refresh(accept.value.tokens.refreshToken, "d2"),
    );
    expect(reuse.ok).toBe(false);
  });
});
