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
