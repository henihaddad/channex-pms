import type { Id } from "../shared/id.js";
import type { GrantRecord, Invitation, MagicLink, Organization, Session, User } from "./types.js";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface TotpVerifier {
  generateSecret(): string;
  /** Returns the otpauth:// URI for enrolment QR codes. */
  uri(secret: string, accountName: string, issuer: string): string;
  verify(secret: string, code: string, nowEpochSeconds: number): boolean;
}

/** Random tokens, one-way hashes and sealing of secrets at rest. */
export interface Crypto {
  randomToken(bytes?: number): string;
  sha256Hex(input: string): string;
  seal(plain: string): Promise<string>;
  open(sealed: string): Promise<string>;
}

export interface Mailer {
  send(mail: {
    to: string;
    template: string;
    locale: string;
    params: Record<string, string>;
  }): Promise<void>;
}

/** Persistence for the identity module. Implemented in packages/db against a tenant or global transaction. */
export interface IdentityRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: Id): Promise<User | null>;
  createUser(user: User): Promise<void>;
  updateUser(id: Id, patch: Partial<Omit<User, "id" | "email">>): Promise<void>;

  createOrganization(org: Organization): Promise<void>;
  isSlugTaken(slug: string): Promise<boolean>;

  createGrant(grant: GrantRecord): Promise<void>;
  listGrantsForSubject(
    subjectType: GrantRecord["subjectType"],
    subjectId: Id,
  ): Promise<GrantRecord[]>;
  revokeGrant(id: Id, at: string): Promise<void>;
  countActiveOrgOwners(orgId: Id, excludingGrantId?: Id): Promise<number>;

  createInvitation(invitation: Invitation): Promise<void>;
  findInvitationByTokenHash(hash: string): Promise<Invitation | null>;
  markInvitationAccepted(id: Id, at: string): Promise<void>;

  createSession(session: Session): Promise<void>;
  findSessionByRefreshHash(hash: string): Promise<Session | null>;
  findSessionById(id: Id): Promise<Session | null>;
  updateSession(id: Id, patch: Partial<Omit<Session, "id" | "userId">>): Promise<void>;
  revokeAllSessions(userId: Id, at: string): Promise<void>;

  createMagicLink(link: MagicLink): Promise<void>;
  /** Atomically consume: returns the link only if unused and unexpired, marking it used. */
  consumeMagicLink(tokenHash: string, now: string): Promise<MagicLink | null>;
}
