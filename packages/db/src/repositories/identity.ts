import { and, eq, isNull, sql } from "drizzle-orm";
import type {
  GrantRecord,
  IdentityRepository,
  Invitation,
  MagicLink,
  Organization,
  Session,
  User,
  Id,
} from "@pms/core";
import * as s from "../schema/index.js";
import type { Tx } from "../tenant.js";

/**
 * Identity repository over a transaction. Global tables (user, session,
 * magic_link) are reachable from any transaction; org tables only inside the
 * matching tenant context (RLS), which is why sign-up runs `withoutTenant` for
 * the user row and then `withTenant` for the organization's rows.
 */
export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(private readonly tx: Tx) {}

  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.tx
      .select()
      .from(s.user)
      .where(eq(sql`lower(${s.user.email})`, email.toLowerCase()))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async findUserById(id: Id): Promise<User | null> {
    const [row] = await this.tx.select().from(s.user).where(eq(s.user.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async createUser(u: User): Promise<void> {
    await this.tx.insert(s.user).values({
      id: u.id,
      email: u.email,
      name: u.name,
      locale: u.locale,
      passwordHash: u.passwordHash,
      totpSecretEnc: u.totpSecretSealed,
      totpEnabled: u.totpEnabled,
      failedLoginCount: u.failedLoginCount,
      lockedUntil: u.lockedUntil,
      lastLoginAt: u.lastLoginAt,
    });
  }

  async updateUser(id: Id, patch: Partial<Omit<User, "id" | "email">>): Promise<void> {
    await this.tx
      .update(s.user)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        ...(patch.passwordHash !== undefined ? { passwordHash: patch.passwordHash } : {}),
        ...(patch.totpSecretSealed !== undefined ? { totpSecretEnc: patch.totpSecretSealed } : {}),
        ...(patch.totpEnabled !== undefined ? { totpEnabled: patch.totpEnabled } : {}),
        ...(patch.failedLoginCount !== undefined
          ? { failedLoginCount: patch.failedLoginCount }
          : {}),
        ...(patch.lockedUntil !== undefined ? { lockedUntil: patch.lockedUntil } : {}),
        ...(patch.lastLoginAt !== undefined ? { lastLoginAt: patch.lastLoginAt } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(s.user.id, id));
  }

  async createOrganization(o: Organization): Promise<void> {
    await this.tx.insert(s.organization).values({
      id: o.id,
      name: o.name,
      slug: o.slug,
      country: o.country,
      defaultCurrency: o.defaultCurrency,
      locale: o.locale,
      state: o.state,
    });
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    // organization is RLS-protected; slug uniqueness is enforced by the unique index, this is a courtesy check
    const res = await this.tx.execute(sql`select 1 from organization where slug = ${slug} limit 1`);
    return rowsOf(res).length > 0;
  }

  async createGrant(g: GrantRecord): Promise<void> {
    await this.tx.insert(s.grant).values({
      id: g.id,
      orgId: g.orgId,
      subjectType: g.subjectType,
      subjectId: g.subjectId,
      roleKey: g.roleKey,
      customRoleId: g.customRoleId,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
      overrides: g.overrides,
      expiresAt: g.expiresAt,
      createdBy: g.createdBy,
    });
  }

  async listGrantsForSubject(
    subjectType: GrantRecord["subjectType"],
    subjectId: Id,
  ): Promise<GrantRecord[]> {
    const rows = await this.tx
      .select()
      .from(s.grant)
      .where(
        and(
          eq(s.grant.subjectType, subjectType),
          eq(s.grant.subjectId, subjectId),
          isNull(s.grant.revokedAt),
        ),
      );
    return rows.map(toGrant);
  }

  async revokeGrant(id: Id, at: string): Promise<void> {
    await this.tx.update(s.grant).set({ revokedAt: at }).where(eq(s.grant.id, id));
  }

  async countActiveOrgOwners(orgId: Id, excludingGrantId?: Id): Promise<number> {
    const rows = await this.tx
      .select({ id: s.grant.id })
      .from(s.grant)
      .where(
        and(eq(s.grant.orgId, orgId), eq(s.grant.roleKey, "org_owner"), isNull(s.grant.revokedAt)),
      );
    return rows.filter((r) => r.id !== excludingGrantId).length;
  }

  async createInvitation(i: Invitation): Promise<void> {
    await this.tx.insert(s.invitation).values({
      id: i.id,
      orgId: i.orgId,
      email: i.email,
      intendedGrant: i.intendedGrant,
      tokenHash: i.tokenHash,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      createdBy: i.createdBy,
    });
  }

  async findInvitationByTokenHash(hash: string): Promise<Invitation | null> {
    const [row] = await this.tx
      .select()
      .from(s.invitation)
      .where(eq(s.invitation.tokenHash, hash))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id as Id,
      orgId: row.orgId as Id,
      email: row.email,
      intendedGrant: row.intendedGrant as Invitation["intendedGrant"],
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      createdBy: row.createdBy as Id | null,
    };
  }

  async markInvitationAccepted(id: Id, at: string): Promise<void> {
    await this.tx.update(s.invitation).set({ acceptedAt: at }).where(eq(s.invitation.id, id));
  }

  async createSession(x: Session): Promise<void> {
    await this.tx.insert(s.session).values({
      id: x.id,
      userId: x.userId,
      refreshHash: x.refreshHash,
      deviceFingerprint: x.deviceFingerprint,
      expiresAt: x.expiresAt,
      lastSeenAt: x.lastSeenAt,
      stepUpAt: x.stepUpAt,
      revokedAt: x.revokedAt,
    });
  }

  async findSessionByRefreshHash(hash: string): Promise<Session | null> {
    const [row] = await this.tx
      .select()
      .from(s.session)
      .where(eq(s.session.refreshHash, hash))
      .limit(1);
    return row ? toSession(row) : null;
  }

  async findSessionById(id: Id): Promise<Session | null> {
    const [row] = await this.tx.select().from(s.session).where(eq(s.session.id, id)).limit(1);
    return row ? toSession(row) : null;
  }

  async updateSession(id: Id, patch: Partial<Omit<Session, "id" | "userId">>): Promise<void> {
    await this.tx.update(s.session).set(patch).where(eq(s.session.id, id));
  }

  async revokeAllSessions(userId: Id, at: string): Promise<void> {
    await this.tx
      .update(s.session)
      .set({ revokedAt: at })
      .where(and(eq(s.session.userId, userId), isNull(s.session.revokedAt)));
  }

  async createMagicLink(l: MagicLink): Promise<void> {
    await this.tx.insert(s.magicLink).values({
      id: l.id,
      email: l.email,
      purpose: l.purpose,
      tokenHash: l.tokenHash,
      payload: l.payload,
      expiresAt: l.expiresAt,
      usedAt: l.usedAt,
    });
  }

  async consumeMagicLink(tokenHash: string, now: string): Promise<MagicLink | null> {
    const rows = await this.tx
      .update(s.magicLink)
      .set({ usedAt: now })
      .where(
        and(
          eq(s.magicLink.tokenHash, tokenHash),
          isNull(s.magicLink.usedAt),
          sql`${s.magicLink.expiresAt} > ${now}`,
        ),
      )
      .returning();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id as Id,
      email: row.email,
      purpose: row.purpose as MagicLink["purpose"],
      tokenHash: row.tokenHash,
      payload: row.payload as Record<string, unknown>,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    };
  }
}

function toUser(row: typeof s.user.$inferSelect): User {
  return {
    id: row.id as Id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    passwordHash: row.passwordHash,
    totpSecretSealed: row.totpSecretEnc,
    totpEnabled: row.totpEnabled,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
  };
}

function toGrant(row: typeof s.grant.$inferSelect): GrantRecord {
  return {
    id: row.id as Id,
    orgId: row.orgId as Id,
    subjectType: row.subjectType as GrantRecord["subjectType"],
    subjectId: row.subjectId as Id,
    roleKey: row.roleKey,
    customRoleId: row.customRoleId as Id | null,
    scopeType: row.scopeType as GrantRecord["scopeType"],
    scopeId: row.scopeId as Id,
    overrides: row.overrides,
    expiresAt: row.expiresAt,
    createdBy: row.createdBy as Id | null,
  };
}

function toSession(row: typeof s.session.$inferSelect): Session {
  return {
    id: row.id as Id,
    userId: row.userId as Id,
    refreshHash: row.refreshHash,
    deviceFingerprint: row.deviceFingerprint,
    expiresAt: row.expiresAt,
    lastSeenAt: row.lastSeenAt,
    stepUpAt: row.stepUpAt,
    revokedAt: row.revokedAt,
  };
}

function rowsOf(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  const r = res as { rows?: unknown[] };
  return r.rows ?? [];
}
