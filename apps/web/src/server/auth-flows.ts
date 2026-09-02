import { cookies } from "next/headers";
import { Id, IdentityService, type Invitation } from "@pms/core";
import {
  DrizzleAuditWriter,
  DrizzleIdentityRepository,
  rawRows,
  sql,
  withoutTenant,
  withTenant,
  type Tx,
} from "@pms/db";
import { container } from "./container";
import { HttpProblem } from "./errors";
import {
  clearSessionCookies,
  clientIp,
  currentSession,
  deviceFingerprint,
  requestId,
  setSessionCookies,
  COOKIES,
} from "./session";

export async function identity(tx: Tx): Promise<IdentityService> {
  const c = await container();
  return new IdentityService({
    repo: new DrizzleIdentityRepository(tx),
    hasher: c.hasher,
    totp: c.totp,
    crypto: c.crypto,
    mailer: c.mailer,
    clock: c.clock,
  });
}

function fail(code: string, message: string, status = 400): never {
  throw new HttpProblem(status, code, message, message);
}

export interface SignUpForm {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  slug: string;
  country: string;
  currency: string;
  locale?: string;
}

/** Sign-up spans a global user row and the new tenant's rows, so the org id is allocated first (RLS). */
export async function signUpFlow(form: SignUpForm): Promise<{ orgId: Id; userId: Id }> {
  const c = await container();
  const orgId = Id.next();
  const [fp, rid, ip] = await Promise.all([deviceFingerprint(), requestId(), clientIp()]);
  const result = await withTenant(
    c.db.db,
    { orgId, actor: { type: "user", id: "signup" }, requestId: rid },
    async (tx) => {
      const svc = await identity(tx);
      const r = await svc.signUp({
        orgId,
        email: form.email,
        password: form.password,
        name: form.name,
        deviceFingerprint: fp,
        organization: {
          name: form.organizationName,
          slug: form.slug,
          country: form.country,
          defaultCurrency: form.currency,
        },
        ...(form.locale ? { locale: form.locale } : {}),
      });
      if (!r.ok) fail(r.error.code, r.error.message, 422);
      await new DrizzleAuditWriter(tx, c.sha256Hex).append({
        orgId,
        actor: { type: "user", id: r.value.user.id },
        action: "org:create",
        subject: { kind: "organization", id: orgId },
        after: { name: form.organizationName, slug: form.slug },
        surface: "web",
        requestId: rid,
        ...(ip ? { ip } : {}),
        occurredAt: c.clock.now().toString(),
      });
      return r.value;
    },
  );
  await setSessionCookies({
    userId: result.user.id,
    sessionId: result.tokens.sessionId,
    refreshToken: result.tokens.refreshToken,
    refreshExpiresAt: result.tokens.refreshExpiresAt,
    orgId,
  });
  return { orgId, userId: result.user.id };
}

export type LoginOutcome = { kind: "session"; orgId: Id | null } | { kind: "totp_required" };

export async function loginFlow(email: string, password: string): Promise<LoginOutcome> {
  const c = await container();
  const fp = await deviceFingerprint();
  const r = await withoutTenant(c.db.db, async (tx) =>
    (await identity(tx)).login(email, password, fp),
  );
  if (!r.ok) fail(r.error.code, r.error.message, r.error.code === "identity.locked" ? 423 : 401);
  if (r.value.kind === "totp_required") {
    const jar = await cookies();
    jar.set("pms_totp", r.value.challengeToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300,
    });
    return { kind: "totp_required" };
  }
  const orgId = await pickOrg(r.value.user.id);
  await setSessionCookies({
    userId: r.value.user.id,
    sessionId: r.value.tokens.sessionId,
    refreshToken: r.value.tokens.refreshToken,
    refreshExpiresAt: r.value.tokens.refreshExpiresAt,
    ...(orgId ? { orgId } : {}),
  });
  return { kind: "session", orgId };
}

/** Owner portal sign-in (spec 17 §17.5): request a link by email; the answer never says whether the email exists. */
export async function requestMagicLinkFlow(email: string, locale: string): Promise<void> {
  const c = await container();
  await withoutTenant(c.db.db, async (tx) =>
    (await identity(tx)).requestMagicLink(email, "owner_portal", locale),
  );
}

/** Consume a magic link: a session for the user and the organization their owner record lives in. */
export async function magicLinkFlow(token: string): Promise<{ orgId: Id | null }> {
  const c = await container();
  const fp = await deviceFingerprint();
  const r = await withoutTenant(c.db.db, async (tx) =>
    (await identity(tx)).consumeMagicLink(token, fp),
  );
  if (!r.ok) fail(r.error.code, r.error.message, 401);
  // the owner's group scopes every portal permission check without a database read inside the transaction (ADR-0007)
  const [ownerRow] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string; group_id: string | null }>(
      tx,
      sql`select org_id, group_id from owner where user_id = ${r.value.user.id} and archived_at is null order by created_at limit 1`,
    ),
  );
  const orgId = (ownerRow?.org_id as Id | undefined) ?? (await pickOrg(r.value.user.id));
  await setSessionCookies({
    userId: r.value.user.id,
    sessionId: r.value.tokens.sessionId,
    refreshToken: r.value.tokens.refreshToken,
    refreshExpiresAt: r.value.tokens.refreshExpiresAt,
    ...(orgId ? { orgId } : {}),
  });
  const jar = await cookies();
  if (ownerRow?.group_id)
    jar.set(OWNER_SCOPE_COOKIE, ownerRow.group_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  return { orgId };
}

export const OWNER_SCOPE_COOKIE = "pms_owner_scope";

export async function totpFlow(code: string): Promise<{ orgId: Id | null }> {
  const c = await container();
  const jar = await cookies();
  const challenge = jar.get("pms_totp")?.value;
  if (!challenge) fail("identity.challenge_invalid", "Login challenge expired", 401);
  const r = await withoutTenant(c.db.db, async (tx) =>
    (await identity(tx)).completeTotpLogin(challenge, code),
  );
  if (!r.ok) fail(r.error.code, r.error.message, 401);
  jar.delete("pms_totp");
  const orgId = await pickOrg(r.value.user.id);
  await setSessionCookies({
    userId: r.value.user.id,
    sessionId: r.value.tokens.sessionId,
    refreshToken: r.value.tokens.refreshToken,
    refreshExpiresAt: r.value.tokens.refreshExpiresAt,
    ...(orgId ? { orgId } : {}),
  });
  return { orgId };
}

export async function refreshFlow(): Promise<boolean> {
  const c = await container();
  const jar = await cookies();
  const token = jar.get(COOKIES.refresh)?.value;
  if (!token) return false;
  const fp = await deviceFingerprint();
  const r = await withoutTenant(c.db.db, async (tx) => (await identity(tx)).refresh(token, fp));
  if (!r.ok) {
    await clearSessionCookies();
    return false;
  }
  const session = await withoutTenant(c.db.db, (tx) =>
    new DrizzleIdentityRepository(tx).findSessionById(r.value.sessionId),
  );
  if (!session) return false;
  await setSessionCookies({
    userId: session.userId,
    sessionId: r.value.sessionId,
    refreshToken: r.value.refreshToken,
    refreshExpiresAt: r.value.refreshExpiresAt,
  });
  return true;
}

export async function logoutFlow(): Promise<void> {
  const c = await container();
  const s = await currentSession();
  if (s)
    await withoutTenant(c.db.db, async (tx) => (await identity(tx)).revokeSession(s.sessionId));
  await clearSessionCookies();
}

export async function acceptInviteFlow(
  orgId: Id,
  token: string,
  acceptor: { name: string; password?: string },
): Promise<{ orgId: Id }> {
  const c = await container();
  const [fp, rid] = await Promise.all([deviceFingerprint(), requestId()]);
  const r = await withTenant(
    c.db.db,
    { orgId, actor: { type: "user", id: "invitee" }, requestId: rid },
    async (tx) => {
      const res = await (
        await identity(tx)
      ).acceptInvitation(token, { ...acceptor, deviceFingerprint: fp });
      if (!res.ok) fail(res.error.code, res.error.message, 422);
      await new DrizzleAuditWriter(tx, c.sha256Hex).append({
        orgId,
        actor: { type: "user", id: res.value.user.id },
        action: "member:accept_invitation",
        subject: { kind: "grant", id: res.value.grant.id },
        after: { roleKey: res.value.grant.roleKey, scopeType: res.value.grant.scopeType },
        surface: "web",
        requestId: rid,
        occurredAt: c.clock.now().toString(),
      });
      return res.value;
    },
  );
  await setSessionCookies({
    userId: r.user.id,
    sessionId: r.tokens.sessionId,
    refreshToken: r.tokens.refreshToken,
    refreshExpiresAt: r.tokens.refreshExpiresAt,
    orgId,
  });
  return { orgId };
}

export async function inviteInTx(
  tx: Tx,
  input: {
    orgId: Id;
    email: string;
    grant: Invitation["intendedGrant"];
    invitedBy: Id;
    locale: string;
    orgName: string;
  },
) {
  const r = await (await identity(tx)).invite(input);
  if (!r.ok) fail(r.error.code, r.error.message, 422);
  return r.value;
}

export async function memberships(
  userId: Id,
): Promise<Array<{ orgId: Id; name: string; slug: string }>> {
  const c = await container();
  return withoutTenant(c.db.db, (tx) => new DrizzleIdentityRepository(tx).listMemberships(userId));
}

async function pickOrg(userId: Id): Promise<Id | null> {
  const list = await memberships(userId);
  return list[0]?.orgId ?? null;
}

/** Step-up (spec 02 §2.6): re-enter the password; the session carries `step_up_at` for five minutes. */
export async function stepUpFlow(password: string): Promise<void> {
  const session = await currentSession();
  if (!session) fail("unauthenticated", "Sign in required", 401);
  const c = await container();
  const r = await withoutTenant(c.db.db, async (tx) =>
    (await identity(tx)).stepUp(session.sessionId, password),
  );
  if (!r.ok) fail(r.error.code, r.error.message, 403);
}
