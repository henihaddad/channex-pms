import type { Id } from "../shared/id.js";

export type SubjectType = "user" | "service_account" | "invitation";
export type ScopeType = "organization" | "group" | "property";

export interface User {
  id: Id;
  email: string;
  name: string;
  locale: string;
  passwordHash: string | null;
  totpSecretSealed: string | null;
  totpEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
}

export interface Organization {
  id: Id;
  name: string;
  slug: string;
  country: string;
  defaultCurrency: string;
  locale: string;
  state: "trial" | "active" | "past_due" | "suspended" | "expired" | "offboarding";
}

export interface GrantRecord {
  id: Id;
  orgId: Id;
  subjectType: SubjectType;
  subjectId: Id;
  roleKey: string | null;
  customRoleId: Id | null;
  scopeType: ScopeType;
  scopeId: Id;
  overrides: { allow?: string[]; deny?: string[] } | null;
  expiresAt: string | null;
  createdBy: Id | null;
}

export interface Invitation {
  id: Id;
  orgId: Id;
  email: string;
  intendedGrant: Pick<
    GrantRecord,
    "roleKey" | "customRoleId" | "scopeType" | "scopeId" | "overrides" | "expiresAt"
  >;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdBy: Id | null;
}

export interface Session {
  id: Id;
  userId: Id;
  refreshHash: string;
  /** The refresh token this one replaced, accepted for REFRESH_GRACE_SECONDS after rotation. */
  prevRefreshHash?: string | null;
  rotatedAt?: string | null;
  deviceFingerprint: string;
  expiresAt: string;
  lastSeenAt: string;
  stepUpAt: string | null;
  revokedAt: string | null;
}

export interface MagicLink {
  id: Id;
  email: string;
  purpose: "login" | "invite" | "owner_portal" | "guest_portal";
  tokenHash: string;
  payload: Record<string, unknown>;
  expiresAt: string;
  usedAt: string | null;
}

/** Tokens the identity service hands back; the adapter turns them into cookies. */
export interface IssuedTokens {
  sessionId: Id;
  refreshToken: string;
  refreshExpiresAt: string;
}

/**
 * A refresh: a new refresh token, or null when the caller presented the token rotated a
 * moment ago (another tab or a parallel request won the race) and should keep the one the
 * browser already holds.
 */
export interface RefreshedSession {
  sessionId: Id;
  refreshToken: string | null;
  refreshExpiresAt: string;
}
