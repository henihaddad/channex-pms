import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { withoutTenant, DrizzleIdentityRepository } from "@pms/db";
import type { Id, Session } from "@pms/core";
import { container } from "./container";

export const COOKIES = {
  access: "pms_at",
  refresh: "pms_rt",
  org: "pms_org",
  device: "pms_dev",
  locale: "pms_locale",
} as const;

const secure = process.env.NODE_ENV === "production";
const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

export interface CurrentSession {
  userId: Id;
  sessionId: Id;
  grantVersion: number;
}

/** Access token from the cookie, verified. Null when absent or expired; the client refreshes via /api/v1/auth/refresh. */
export async function currentSession(): Promise<CurrentSession | null> {
  const jar = await cookies();
  const bearer = (await headers()).get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : jar.get(COOKIES.access)?.value;
  if (!token) return null;
  const c = await container();
  const claims = await c.tokens.verifyAccess(token);
  return claims
    ? { userId: claims.sub as Id, sessionId: claims.sid as Id, grantVersion: claims.gv }
    : null;
}

export async function loadSessionRow(sessionId: Id): Promise<Session | null> {
  const c = await container();
  return withoutTenant(c.db.db, (tx) =>
    new DrizzleIdentityRepository(tx).findSessionById(sessionId),
  );
}

/** A stable per-browser fingerprint: random cookie plus user agent (spec 02 §2.6 refresh binding). */
export async function deviceFingerprint(): Promise<string> {
  const jar = await cookies();
  const h = await headers();
  let dev = jar.get(COOKIES.device)?.value;
  if (!dev) {
    dev = createHash("sha256")
      .update(String(Math.random()) + Date.now().toString())
      .digest("hex")
      .slice(0, 32);
    jar.set(COOKIES.device, dev, { ...base, maxAge: 60 * 60 * 24 * 365 });
  }
  return createHash("sha256")
    .update(`${dev}|${h.get("user-agent") ?? ""}`)
    .digest("hex");
}

export async function setSessionCookies(input: {
  userId: Id;
  sessionId: Id;
  refreshToken: string;
  refreshExpiresAt: string;
  orgId?: Id;
}): Promise<void> {
  const c = await container();
  const jar = await cookies();
  const access = await c.tokens.issueAccess({ sub: input.userId, sid: input.sessionId, gv: 0 });
  jar.set(COOKIES.access, access, { ...base, maxAge: c.tokens.accessTtlSeconds });
  jar.set(COOKIES.refresh, input.refreshToken, {
    ...base,
    expires: new Date(input.refreshExpiresAt),
  });
  if (input.orgId) jar.set(COOKIES.org, input.orgId, { ...base, maxAge: 60 * 60 * 24 * 365 });
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of [COOKIES.access, COOKIES.refresh, COOKIES.org]) jar.delete(name);
}

export async function currentOrgId(): Promise<Id | null> {
  const fromHeader = (await headers()).get("x-pms-org");
  if (fromHeader) return fromHeader as Id;
  const jar = await cookies();
  return (jar.get(COOKIES.org)?.value as Id | undefined) ?? null;
}

export async function setCurrentOrg(orgId: Id): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIES.org, orgId, { ...base, maxAge: 60 * 60 * 24 * 365 });
}

export async function currentLocale(): Promise<string> {
  const jar = await cookies();
  return jar.get(COOKIES.locale)?.value ?? "en";
}

export async function requestId(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-request-id") ??
    createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 16)
  );
}

export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}
