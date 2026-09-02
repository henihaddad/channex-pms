import { Temporal } from "temporal-polyfill";
import type { Clock } from "../shared/clock.js";
import { Id } from "../shared/id.js";
import { DomainError, err, ok, type Result } from "../shared/result.js";
import type { Crypto, IdentityRepository, Mailer, PasswordHasher, TotpVerifier } from "./ports.js";
import type {
  GrantRecord,
  Invitation,
  IssuedTokens,
  MagicLink,
  Organization,
  Session,
  User,
} from "./types.js";

export interface IdentityDeps {
  repo: IdentityRepository;
  hasher: PasswordHasher;
  totp: TotpVerifier;
  crypto: Crypto;
  mailer: Mailer;
  clock: Clock;
  config?: Partial<IdentityConfig>;
}

export interface IdentityConfig {
  /** Refresh-token lifetime. Access tokens are minted by the adapter for 15 minutes (spec 02 §2.6). */
  refreshTtlDays: number;
  invitationTtlDays: number;
  magicLinkTtlMinutes: number;
  maxFailedLogins: number;
  lockoutBaseMinutes: number;
  totpIssuer: string;
}

const DEFAULTS: IdentityConfig = {
  refreshTtlDays: 30,
  invitationTtlDays: 7,
  magicLinkTtlMinutes: 15,
  maxFailedLogins: 5,
  lockoutBaseMinutes: 15,
  totpIssuer: "Channex PMS",
};

const MIN_PASSWORD = 12;

export interface SignUpInput {
  /** Allocated by the adapter before opening the tenant transaction (RLS needs it set). */
  orgId: Id;
  email: string;
  password: string;
  name: string;
  locale?: string;
  organization: { name: string; slug: string; country: string; defaultCurrency: string };
  deviceFingerprint: string;
}

export type LoginResult =
  | { kind: "session"; tokens: IssuedTokens; user: User }
  | { kind: "totp_required"; challengeToken: string; userId: Id };

/**
 * Identity: sign-up, login with lockout, TOTP, invitations, magic links and
 * rotating refresh sessions (spec 02 §2.6, spec 13 §13.5). Pure over ports.
 */
export class IdentityService {
  private readonly cfg: IdentityConfig;

  constructor(private readonly deps: IdentityDeps) {
    this.cfg = { ...DEFAULTS, ...deps.config };
  }

  private now(): string {
    return this.deps.clock.now().toString();
  }

  private plus(duration: { days?: number; minutes?: number }): string {
    const ms = (duration.days ?? 0) * 86_400_000 + (duration.minutes ?? 0) * 60_000;
    return this.deps.clock.now().add({ milliseconds: ms }).toString();
  }

  async signUp(
    input: SignUpInput,
  ): Promise<Result<{ user: User; organization: Organization; tokens: IssuedTokens }>> {
    const email = normaliseEmail(input.email);
    if (input.password.length < MIN_PASSWORD)
      return err(
        new DomainError(
          "identity.weak_password",
          `Password must be at least ${String(MIN_PASSWORD)} characters`,
        ),
      );
    if (await this.deps.repo.findUserByEmail(email))
      return err(
        new DomainError("identity.email_taken", "An account with this email already exists"),
      );
    if (await this.deps.repo.isSlugTaken(input.organization.slug))
      return err(new DomainError("identity.slug_taken", "Organization slug is taken"));

    const user: User = {
      id: Id.next(),
      email,
      name: input.name,
      locale: input.locale ?? "en",
      passwordHash: await this.deps.hasher.hash(input.password),
      totpSecretSealed: null,
      totpEnabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: this.now(),
    };
    const organization: Organization = {
      id: input.orgId,
      ...input.organization,
      locale: user.locale,
      state: "trial",
    };
    await this.deps.repo.createUser(user);
    await this.deps.repo.createOrganization(organization);
    await this.deps.repo.createGrant({
      id: Id.next(),
      orgId: organization.id,
      subjectType: "user",
      subjectId: user.id,
      roleKey: "org_owner",
      customRoleId: null,
      scopeType: "organization",
      scopeId: organization.id,
      overrides: null,
      expiresAt: null,
      createdBy: user.id,
    });
    const tokens = await this.issueSession(user.id, input.deviceFingerprint);
    return ok({ user, organization, tokens });
  }

  async login(
    email: string,
    password: string,
    deviceFingerprint: string,
  ): Promise<Result<LoginResult>> {
    const user = await this.deps.repo.findUserByEmail(normaliseEmail(email));
    const invalid = new DomainError("identity.invalid_credentials", "Invalid email or password");
    if (!user?.passwordHash) return err(invalid);
    if (user.lockedUntil && user.lockedUntil > this.now()) {
      return err(
        new DomainError("identity.locked", "Account temporarily locked", {
          until: user.lockedUntil,
        }),
      );
    }
    if (!(await this.deps.hasher.verify(user.passwordHash, password))) {
      const failed = user.failedLoginCount + 1;
      const patch: Partial<User> = { failedLoginCount: failed };
      if (failed >= this.cfg.maxFailedLogins) {
        const minutes = this.cfg.lockoutBaseMinutes * 2 ** (failed - this.cfg.maxFailedLogins);
        patch.lockedUntil = this.plus({ minutes });
      }
      await this.deps.repo.updateUser(user.id, patch);
      return err(invalid);
    }
    await this.deps.repo.updateUser(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: this.now(),
    });
    if (user.totpEnabled) {
      const challengeToken = this.deps.crypto.randomToken(32);
      await this.deps.repo.createMagicLink({
        id: Id.next(),
        email: user.email,
        purpose: "login",
        tokenHash: this.deps.crypto.sha256Hex(challengeToken),
        payload: { userId: user.id, stage: "totp", deviceFingerprint },
        expiresAt: this.plus({ minutes: 5 }),
        usedAt: null,
      });
      return ok({ kind: "totp_required", challengeToken, userId: user.id });
    }
    return ok({
      kind: "session",
      tokens: await this.issueSession(user.id, deviceFingerprint),
      user,
    });
  }

  async completeTotpLogin(
    challengeToken: string,
    code: string,
  ): Promise<Result<{ tokens: IssuedTokens; user: User }>> {
    const link = await this.deps.repo.consumeMagicLink(
      this.deps.crypto.sha256Hex(challengeToken),
      this.now(),
    );
    if (!link || link.payload.stage !== "totp")
      return err(new DomainError("identity.challenge_invalid", "Login challenge expired"));
    const user = await this.deps.repo.findUserById(link.payload.userId as Id);
    if (!user?.totpSecretSealed)
      return err(new DomainError("identity.challenge_invalid", "Login challenge expired"));
    const secret = await this.deps.crypto.open(user.totpSecretSealed);
    if (!this.deps.totp.verify(secret, code, this.deps.clock.now().epochMilliseconds / 1000)) {
      return err(new DomainError("identity.totp_invalid", "Invalid code"));
    }
    return ok({
      tokens: await this.issueSession(user.id, String(link.payload.deviceFingerprint)),
      user,
    });
  }

  async beginTotpEnrolment(userId: Id): Promise<Result<{ secret: string; uri: string }>> {
    const user = await this.deps.repo.findUserById(userId);
    if (!user) return err(new DomainError("identity.not_found", "User not found"));
    const secret = this.deps.totp.generateSecret();
    await this.deps.repo.updateUser(userId, {
      totpSecretSealed: await this.deps.crypto.seal(secret),
      totpEnabled: false,
    });
    return ok({ secret, uri: this.deps.totp.uri(secret, user.email, this.cfg.totpIssuer) });
  }

  async confirmTotpEnrolment(userId: Id, code: string): Promise<Result<void>> {
    const user = await this.deps.repo.findUserById(userId);
    if (!user?.totpSecretSealed)
      return err(new DomainError("identity.totp_not_started", "Enrolment not started"));
    const secret = await this.deps.crypto.open(user.totpSecretSealed);
    if (!this.deps.totp.verify(secret, code, this.deps.clock.now().epochMilliseconds / 1000)) {
      return err(new DomainError("identity.totp_invalid", "Invalid code"));
    }
    await this.deps.repo.updateUser(userId, { totpEnabled: true });
    return ok(undefined);
  }

  /** Rotating refresh: the presented token is invalidated, a new one issued. Reuse of a rotated token revokes the session (theft signal). */
  async refresh(refreshToken: string, deviceFingerprint: string): Promise<Result<IssuedTokens>> {
    const hash = this.deps.crypto.sha256Hex(refreshToken);
    const session = await this.deps.repo.findSessionByRefreshHash(hash);
    const invalid = new DomainError("identity.session_invalid", "Session expired");
    if (!session) return err(invalid);
    if (session.revokedAt || session.expiresAt <= this.now()) return err(invalid);
    if (session.deviceFingerprint !== deviceFingerprint) {
      await this.deps.repo.updateSession(session.id, { revokedAt: this.now() });
      return err(
        new DomainError("identity.session_device_mismatch", "Session bound to another device"),
      );
    }
    const next = this.deps.crypto.randomToken(32);
    const expiresAt = this.plus({ days: this.cfg.refreshTtlDays });
    await this.deps.repo.updateSession(session.id, {
      refreshHash: this.deps.crypto.sha256Hex(next),
      expiresAt,
      lastSeenAt: this.now(),
    });
    return ok({ sessionId: session.id, refreshToken: next, refreshExpiresAt: expiresAt });
  }

  async revokeSession(sessionId: Id): Promise<void> {
    await this.deps.repo.updateSession(sessionId, { revokedAt: this.now() });
  }

  async signOutEverywhere(userId: Id): Promise<void> {
    await this.deps.repo.revokeAllSessions(userId, this.now());
  }

  /** Step-up: re-authentication within the last 5 minutes (spec 02 §2.6). */
  async stepUp(sessionId: Id, password: string): Promise<Result<void>> {
    const session = await this.deps.repo.findSessionById(sessionId);
    const user = session ? await this.deps.repo.findUserById(session.userId) : null;
    if (
      !session ||
      !user?.passwordHash ||
      !(await this.deps.hasher.verify(user.passwordHash, password))
    ) {
      return err(new DomainError("identity.invalid_credentials", "Invalid password"));
    }
    await this.deps.repo.updateSession(sessionId, { stepUpAt: this.now() });
    return ok(undefined);
  }

  isSteppedUp(session: Session): boolean {
    return (
      !!session.stepUpAt &&
      Temporal.Instant.from(session.stepUpAt).add({ minutes: 5 }).epochMilliseconds >
        this.deps.clock.now().epochMilliseconds
    );
  }

  async invite(input: {
    orgId: Id;
    email: string;
    grant: Invitation["intendedGrant"];
    invitedBy: Id;
    locale: string;
    orgName: string;
  }): Promise<Result<{ invitation: Invitation; token: string }>> {
    const token = this.deps.crypto.randomToken(32);
    const invitation: Invitation = {
      id: Id.next(),
      orgId: input.orgId,
      email: normaliseEmail(input.email),
      intendedGrant: input.grant,
      tokenHash: this.deps.crypto.sha256Hex(token),
      expiresAt: this.plus({ days: this.cfg.invitationTtlDays }),
      acceptedAt: null,
      createdBy: input.invitedBy,
    };
    await this.deps.repo.createInvitation(invitation);
    await this.deps.mailer.send({
      to: invitation.email,
      template: "invitation",
      locale: input.locale,
      params: { org: input.orgName, token },
    });
    return ok({ invitation, token });
  }

  /** Accept as an existing or new user; the intended grant is created for the accepting user. */
  async acceptInvitation(
    token: string,
    acceptor: { name: string; password?: string; deviceFingerprint: string },
  ): Promise<Result<{ user: User; grant: GrantRecord; tokens: IssuedTokens }>> {
    const invitation = await this.deps.repo.findInvitationByTokenHash(
      this.deps.crypto.sha256Hex(token),
    );
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= this.now()) {
      return err(
        new DomainError("identity.invitation_invalid", "Invitation is invalid or expired"),
      );
    }
    let user = await this.deps.repo.findUserByEmail(invitation.email);
    if (!user) {
      if (!acceptor.password || acceptor.password.length < MIN_PASSWORD) {
        return err(
          new DomainError(
            "identity.weak_password",
            `Password must be at least ${String(MIN_PASSWORD)} characters`,
          ),
        );
      }
      user = {
        id: Id.next(),
        email: invitation.email,
        name: acceptor.name,
        locale: "en",
        passwordHash: await this.deps.hasher.hash(acceptor.password),
        totpSecretSealed: null,
        totpEnabled: false,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: this.now(),
      };
      await this.deps.repo.createUser(user);
    }
    const grant: GrantRecord = {
      id: Id.next(),
      orgId: invitation.orgId,
      subjectType: "user",
      subjectId: user.id,
      ...invitation.intendedGrant,
      createdBy: invitation.createdBy,
    };
    await this.deps.repo.createGrant(grant);
    await this.deps.repo.markInvitationAccepted(invitation.id, this.now());
    return ok({
      user,
      grant,
      tokens: await this.issueSession(user.id, acceptor.deviceFingerprint),
    });
  }

  /** RBAC-4 and RBAC-5: an organization keeps at least one org_owner; nobody removes their own last grant. */
  async revokeGrant(grant: GrantRecord, actorUserId: Id): Promise<Result<void>> {
    if (
      grant.roleKey === "org_owner" &&
      (await this.deps.repo.countActiveOrgOwners(grant.orgId, grant.id)) === 0
    ) {
      return err(
        new DomainError(
          "identity.last_org_owner",
          "An organization must keep at least one owner (RBAC-4)",
        ),
      );
    }
    if (grant.subjectType === "user" && grant.subjectId === actorUserId) {
      const others = (await this.deps.repo.listGrantsForSubject("user", actorUserId)).filter(
        (g) => g.id !== grant.id && g.orgId === grant.orgId,
      );
      if (others.length === 0)
        return err(
          new DomainError(
            "identity.self_lockout",
            "You cannot remove your own last grant (RBAC-5)",
          ),
        );
    }
    await this.deps.repo.revokeGrant(grant.id, this.now());
    return ok(undefined);
  }

  /** Passwordless login for owners and cleaners (spec 02 §2.6). Always answers the same way to avoid enumeration. */
  async requestMagicLink(
    email: string,
    purpose: MagicLink["purpose"],
    locale: string,
  ): Promise<{ token: string | null }> {
    const user = await this.deps.repo.findUserByEmail(normaliseEmail(email));
    if (!user) return { token: null };
    const token = this.deps.crypto.randomToken(32);
    await this.deps.repo.createMagicLink({
      id: Id.next(),
      email: user.email,
      purpose,
      tokenHash: this.deps.crypto.sha256Hex(token),
      payload: { userId: user.id },
      expiresAt: this.plus({ minutes: this.cfg.magicLinkTtlMinutes }),
      usedAt: null,
    });
    await this.deps.mailer.send({
      to: user.email,
      template: "magic_link",
      locale,
      params: { token },
    });
    return { token };
  }

  async consumeMagicLink(
    token: string,
    deviceFingerprint: string,
  ): Promise<Result<{ tokens: IssuedTokens; user: User }>> {
    const link = await this.deps.repo.consumeMagicLink(
      this.deps.crypto.sha256Hex(token),
      this.now(),
    );
    if (!link || link.purpose === "guest_portal")
      return err(new DomainError("identity.magic_link_invalid", "Link is invalid or expired"));
    const user = await this.deps.repo.findUserById(link.payload.userId as Id);
    if (!user)
      return err(new DomainError("identity.magic_link_invalid", "Link is invalid or expired"));
    await this.deps.repo.updateUser(user.id, { lastLoginAt: this.now() });
    return ok({ tokens: await this.issueSession(user.id, deviceFingerprint), user });
  }

  private async issueSession(userId: Id, deviceFingerprint: string): Promise<IssuedTokens> {
    const refreshToken = this.deps.crypto.randomToken(32);
    const expiresAt = this.plus({ days: this.cfg.refreshTtlDays });
    const session: Session = {
      id: Id.next(),
      userId,
      refreshHash: this.deps.crypto.sha256Hex(refreshToken),
      deviceFingerprint,
      expiresAt,
      lastSeenAt: this.now(),
      stepUpAt: null,
      revokedAt: null,
    };
    await this.deps.repo.createSession(session);
    return { sessionId: session.id, refreshToken, refreshExpiresAt: expiresAt };
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
