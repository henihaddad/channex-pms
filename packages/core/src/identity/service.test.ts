import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { FakeClock } from "../shared/clock.js";
import { Id } from "../shared/id.js";
import { IdentityService } from "./service.js";
import type { Crypto, IdentityRepository, Mailer, PasswordHasher, TotpVerifier } from "./ports.js";
import type { GrantRecord, Invitation, MagicLink, Organization, Session, User } from "./types.js";

class MemoryRepo implements IdentityRepository {
  users = new Map<string, User>();
  orgs = new Map<string, Organization>();
  grants: GrantRecord[] = [];
  invitations: Invitation[] = [];
  sessions = new Map<string, Session>();
  links: MagicLink[] = [];

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async createUser(u: User) {
    this.users.set(u.id, { ...u });
  }
  async updateUser(id: string, patch: Partial<User>) {
    this.users.set(id, { ...this.users.get(id)!, ...patch });
  }
  async createOrganization(o: Organization) {
    this.orgs.set(o.id, o);
  }
  async isSlugTaken(slug: string) {
    return [...this.orgs.values()].some((o) => o.slug === slug);
  }
  async createGrant(g: GrantRecord) {
    this.grants.push({ ...g });
  }
  async listGrantsForSubject(t: string, id: string) {
    return this.grants.filter(
      (g) => g.subjectType === t && g.subjectId === id && !("revokedAt" in g),
    );
  }
  async revokeGrant(id: string) {
    this.grants = this.grants.filter((g) => g.id !== id);
  }
  async countActiveOrgOwners(orgId: string, excluding?: string) {
    return this.grants.filter(
      (g) => g.orgId === orgId && g.roleKey === "org_owner" && g.id !== excluding,
    ).length;
  }
  async createInvitation(i: Invitation) {
    this.invitations.push({ ...i });
  }
  async findInvitationByTokenHash(h: string) {
    return this.invitations.find((i) => i.tokenHash === h) ?? null;
  }
  async markInvitationAccepted(id: string, at: string) {
    const i = this.invitations.find((x) => x.id === id)!;
    i.acceptedAt = at;
  }
  async createSession(s: Session) {
    this.sessions.set(s.id, { ...s });
  }
  async findSessionByRefreshHash(h: string) {
    return [...this.sessions.values()].find((s) => s.refreshHash === h) ?? null;
  }
  async findSessionById(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async updateSession(id: string, patch: Partial<Session>) {
    this.sessions.set(id, { ...this.sessions.get(id)!, ...patch });
  }
  async revokeAllSessions(userId: string, at: string) {
    for (const s of this.sessions.values()) if (s.userId === userId) s.revokedAt = at;
  }
  async createMagicLink(l: MagicLink) {
    this.links.push({ ...l });
  }
  async consumeMagicLink(h: string, now: string) {
    const l = this.links.find((x) => x.tokenHash === h);
    if (!l || l.usedAt || l.expiresAt <= now) return null;
    l.usedAt = now;
    return l;
  }
}

const hasher: PasswordHasher = {
  hash: async (p) => `h:${p}`,
  verify: async (h, p) => h === `h:${p}`,
};
const totp: TotpVerifier = {
  generateSecret: () => "SECRET",
  uri: (s, a, i) => `otpauth://totp/${i}:${a}?secret=${s}`,
  verify: (s, code) => s === "SECRET" && code === "123456",
};
const crypto: Crypto = {
  randomToken: (n = 32) => randomBytes(n).toString("hex"),
  sha256Hex: (s) => createHash("sha256").update(s).digest("hex"),
  seal: async (p) => `sealed:${p}`,
  open: async (s) => s.replace("sealed:", ""),
};
const sent: { to: string; template: string }[] = [];
const mailer: Mailer = {
  send: async (m) => {
    sent.push(m);
  },
};

function setup() {
  const repo = new MemoryRepo();
  const clock = new FakeClock("2026-09-02T10:00:00Z");
  const svc = new IdentityService({ repo, hasher, totp, crypto, mailer, clock });
  return { repo, clock, svc };
}

const signup = {
  orgId: Id.next(),
  email: "Ana@Example.com",
  password: "correct horse battery",
  name: "Ana",
  organization: { name: "Coastal", slug: "coastal", country: "PT", defaultCurrency: "EUR" },
  deviceFingerprint: "dev-1",
};

describe("IdentityService", () => {
  it("signs up a user with an org_owner grant on a new organization", async () => {
    const { repo, svc } = setup();
    const r = await svc.signUp(signup);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.user.email).toBe("ana@example.com");
    expect(repo.grants).toHaveLength(1);
    expect(repo.grants[0]).toMatchObject({
      roleKey: "org_owner",
      scopeType: "organization",
      scopeId: r.value.organization.id,
    });
    expect((await svc.signUp(signup)).ok).toBe(false);
    expect((await svc.signUp({ ...signup, email: "x@y.z", password: "short" })).ok).toBe(false);
  });

  it("locks the account after repeated failures with exponential backoff", async () => {
    const { repo, svc, clock } = setup();
    await svc.signUp(signup);
    for (let i = 0; i < 5; i++)
      expect((await svc.login(signup.email, "wrong", "dev-1")).ok).toBe(false);
    const user = await repo.findUserByEmail("ana@example.com");
    expect(user?.lockedUntil).toBe("2026-09-02T10:15:00Z");
    const locked = await svc.login(signup.email, signup.password, "dev-1");
    expect(locked.ok).toBe(false);
    clock.advance({ minutes: 16 });
    const okLogin = await svc.login(signup.email, signup.password, "dev-1");
    expect(okLogin.ok && okLogin.value.kind).toBe("session");
  });

  it("requires TOTP once enrolled and completes with a valid code", async () => {
    const { svc } = setup();
    const su = await svc.signUp(signup);
    if (!su.ok) throw new Error();
    const enrol = await svc.beginTotpEnrolment(su.value.user.id);
    expect(enrol.ok && enrol.value.uri).toContain("otpauth://");
    expect((await svc.confirmTotpEnrolment(su.value.user.id, "000000")).ok).toBe(false);
    expect((await svc.confirmTotpEnrolment(su.value.user.id, "123456")).ok).toBe(true);
    const login = await svc.login(signup.email, signup.password, "dev-2");
    if (!login.ok || login.value.kind !== "totp_required")
      throw new Error("expected totp challenge");
    expect((await svc.completeTotpLogin(login.value.challengeToken, "999999")).ok).toBe(false);
    const done = await svc.completeTotpLogin(login.value.challengeToken, "123456");
    expect(done.ok).toBe(false); // challenge consumed by the failed attempt
    const login2 = await svc.login(signup.email, signup.password, "dev-2");
    if (!login2.ok || login2.value.kind !== "totp_required") throw new Error();
    expect((await svc.completeTotpLogin(login2.value.challengeToken, "123456")).ok).toBe(true);
  });

  it("rotates refresh tokens and revokes on device mismatch", async () => {
    const { svc } = setup();
    const su = await svc.signUp(signup);
    if (!su.ok) throw new Error();
    const first = su.value.tokens.refreshToken;
    const r1 = await svc.refresh(first, "dev-1");
    expect(r1.ok).toBe(true);
    expect((await svc.refresh(first, "dev-1")).ok).toBe(false); // old token dead
    if (!r1.ok) return;
    expect((await svc.refresh(r1.value.refreshToken, "other-device")).ok).toBe(false);
    expect((await svc.refresh(r1.value.refreshToken, "dev-1")).ok).toBe(false); // revoked by mismatch
  });

  it("invites a colleague and creates the intended grant on acceptance", async () => {
    const { repo, svc } = setup();
    const su = await svc.signUp(signup);
    if (!su.ok) throw new Error();
    const orgId = su.value.organization.id;
    const inv = await svc.invite({
      orgId,
      email: "bob@example.com",
      invitedBy: su.value.user.id,
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
    });
    if (!inv.ok) throw new Error();
    expect(sent.at(-1)).toMatchObject({ to: "bob@example.com", template: "invitation" });
    expect(
      (
        await svc.acceptInvitation(inv.value.token, {
          name: "Bob",
          password: "short",
          deviceFingerprint: "d",
        })
      ).ok,
    ).toBe(false);
    const acc = await svc.acceptInvitation(inv.value.token, {
      name: "Bob",
      password: "a strong password!",
      deviceFingerprint: "d",
    });
    expect(acc.ok).toBe(true);
    expect(
      repo.grants.find((g) => g.subjectId === (acc.ok ? acc.value.user.id : "")),
    ).toMatchObject({ roleKey: "property_manager" });
    expect(
      (await svc.acceptInvitation(inv.value.token, { name: "Bob", deviceFingerprint: "d" })).ok,
    ).toBe(false);
  });

  it("protects the last org_owner and a subject's own last grant (RBAC-4, RBAC-5)", async () => {
    const { repo, svc } = setup();
    const su = await svc.signUp(signup);
    if (!su.ok) throw new Error();
    const ownerGrant = repo.grants[0]!;
    const r = await svc.revokeGrant(ownerGrant, su.value.user.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("identity.last_org_owner");
    const other: GrantRecord = { ...ownerGrant, id: Id.next(), subjectId: Id.next() };
    await repo.createGrant(other);
    const r2 = await svc.revokeGrant(ownerGrant, su.value.user.id);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("identity.self_lockout");
    expect((await svc.revokeGrant(other, su.value.user.id)).ok).toBe(true);
  });

  it("magic links are single-use and expire", async () => {
    const { svc, clock } = setup();
    await svc.signUp(signup);
    expect((await svc.requestMagicLink("nobody@example.com", "login", "en")).token).toBeNull();
    const { token } = await svc.requestMagicLink(signup.email, "login", "en");
    expect((await svc.consumeMagicLink(token!, "dev-3")).ok).toBe(true);
    expect((await svc.consumeMagicLink(token!, "dev-3")).ok).toBe(false);
    const { token: t2 } = await svc.requestMagicLink(signup.email, "login", "en");
    clock.advance({ minutes: 16 });
    expect((await svc.consumeMagicLink(t2!, "dev-3")).ok).toBe(false);
  });
});
