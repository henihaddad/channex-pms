import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";
import { DrizzleApiKeyRepository } from "./api-keys.js";

/**
 * MCP sign-in storage (spec 04 §4.7b). Two halves:
 *
 * - `DrizzleOAuthStore`: the global tables (clients, codes, refresh tokens), reached by hash
 *   before any tenant exists. Run it inside `withoutTenant`, or inside a tenant transaction
 *   when the same unit of work also writes tenant rows.
 * - `DrizzleOAuthGrantRepository`: a person's consent, its service account and the access
 *   tokens (`api_key` rows with an expiry), under the tenant's RLS.
 */

export interface OAuthClientRow {
  clientId: string;
  clientSecretHash: string | null;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: string;
  grantTypes: string[];
  clientUri: string | null;
  scope: string | null;
  createdAt: string;
}

export interface OAuthCodeRow {
  id: string;
  grantId: string;
  orgId: string;
  serviceAccountId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface OAuthRefreshRow {
  id: string;
  grantId: string;
  orgId: string;
  serviceAccountId: string;
  clientId: string;
  resource: string;
  expiresAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

/** One connected app on Settings → API & AI. */
export interface ConnectedAppRow {
  grantId: string;
  serviceAccountId: string;
  /** The service account's name: "Claude (claude.ai)". */
  name: string;
  clientName: string;
  access: string;
  createdAt: string;
  lastUsedAt: string | null;
  createdByName: string | null;
}

export class DrizzleOAuthStore {
  constructor(private readonly tx: Tx) {}

  async registerClient(c: {
    id: string;
    clientId: string;
    clientSecretHash: string | null;
    clientName: string;
    redirectUris: readonly string[];
    tokenEndpointAuthMethod: string;
    grantTypes: readonly string[];
    clientUri: string | null;
    scope: string | null;
    registeredIp: string | null;
  }): Promise<{ createdAt: string }> {
    const [row] = await this.tx
      .insert(s.oauthClient)
      .values({
        ...c,
        redirectUris: [...c.redirectUris],
        grantTypes: [...c.grantTypes],
      })
      .returning({ createdAt: s.oauthClient.createdAt });
    return { createdAt: row!.createdAt };
  }

  /** Registrations from one address since a moment, for the per-address cap. */
  async registrationsSince(ip: string, since: string): Promise<number> {
    const [r] = await rawRows<{ n: number }>(
      this.tx,
      sql`select count(*)::int as n from oauth_client where registered_ip = ${ip} and created_at > ${since}`,
    );
    return Number(r?.n ?? 0);
  }

  async findClient(clientId: string): Promise<OAuthClientRow | null> {
    const [r] = await this.tx
      .select()
      .from(s.oauthClient)
      .where(eq(s.oauthClient.clientId, clientId))
      .limit(1);
    return r
      ? {
          clientId: r.clientId,
          clientSecretHash: r.clientSecretHash,
          clientName: r.clientName,
          redirectUris: r.redirectUris,
          tokenEndpointAuthMethod: r.tokenEndpointAuthMethod,
          grantTypes: r.grantTypes,
          clientUri: r.clientUri,
          scope: r.scope,
          createdAt: r.createdAt,
        }
      : null;
  }

  async insertCode(c: Omit<OAuthCodeRow, "usedAt"> & { codeHash: string }): Promise<void> {
    await this.tx.insert(s.oauthCode).values(c);
  }

  /**
   * Consume a code atomically: the first presentation stamps `used_at` and gets `firstUse`;
   * any later one finds it used (a replay). Null for a code we never issued.
   */
  async consumeCode(
    codeHash: string,
    at: string,
  ): Promise<{ code: OAuthCodeRow; firstUse: boolean } | null> {
    const cols = {
      id: s.oauthCode.id,
      grantId: s.oauthCode.grantId,
      orgId: s.oauthCode.orgId,
      serviceAccountId: s.oauthCode.serviceAccountId,
      clientId: s.oauthCode.clientId,
      redirectUri: s.oauthCode.redirectUri,
      codeChallenge: s.oauthCode.codeChallenge,
      resource: s.oauthCode.resource,
      expiresAt: s.oauthCode.expiresAt,
      usedAt: s.oauthCode.usedAt,
    };
    const [fresh] = await this.tx
      .update(s.oauthCode)
      .set({ usedAt: at })
      .where(and(eq(s.oauthCode.codeHash, codeHash), isNull(s.oauthCode.usedAt)))
      .returning(cols);
    if (fresh) return { code: fresh, firstUse: true };
    const [seen] = await this.tx
      .select(cols)
      .from(s.oauthCode)
      .where(eq(s.oauthCode.codeHash, codeHash))
      .limit(1);
    return seen ? { code: seen, firstUse: false } : null;
  }

  async insertRefreshToken(
    r: Omit<OAuthRefreshRow, "rotatedAt" | "revokedAt"> & { tokenHash: string },
  ): Promise<void> {
    await this.tx.insert(s.oauthRefreshToken).values(r);
  }

  async findRefreshToken(tokenHash: string): Promise<OAuthRefreshRow | null> {
    const [r] = await this.tx
      .select({
        id: s.oauthRefreshToken.id,
        grantId: s.oauthRefreshToken.grantId,
        orgId: s.oauthRefreshToken.orgId,
        serviceAccountId: s.oauthRefreshToken.serviceAccountId,
        clientId: s.oauthRefreshToken.clientId,
        resource: s.oauthRefreshToken.resource,
        expiresAt: s.oauthRefreshToken.expiresAt,
        rotatedAt: s.oauthRefreshToken.rotatedAt,
        revokedAt: s.oauthRefreshToken.revokedAt,
      })
      .from(s.oauthRefreshToken)
      .where(eq(s.oauthRefreshToken.tokenHash, tokenHash))
      .limit(1);
    return r ?? null;
  }

  /**
   * Mark a refresh token rotated, once: false when a concurrent request rotated it first, it
   * was revoked, or it expired (the caller then treats the presentation as reuse or invalid).
   */
  async rotateRefreshToken(id: string, at: string): Promise<boolean> {
    const rows = await this.tx
      .update(s.oauthRefreshToken)
      .set({ rotatedAt: at })
      .where(
        and(
          eq(s.oauthRefreshToken.id, id),
          isNull(s.oauthRefreshToken.rotatedAt),
          isNull(s.oauthRefreshToken.revokedAt),
          gt(s.oauthRefreshToken.expiresAt, at),
        ),
      )
      .returning({ id: s.oauthRefreshToken.id });
    return rows.length === 1;
  }

  async revokeRefreshTokensOfGrant(grantId: string, at: string): Promise<void> {
    await this.tx
      .update(s.oauthRefreshToken)
      .set({ revokedAt: at })
      .where(and(eq(s.oauthRefreshToken.grantId, grantId), isNull(s.oauthRefreshToken.revokedAt)));
  }
}

export class DrizzleOAuthGrantRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  /**
   * Approve a client: a service account named after it holding the access level's
   * permissions (the same explicit grant as an API key), and the consent row.
   */
  async create(g: {
    grantId: string;
    serviceAccountId: string;
    authzGrantId: string;
    name: string;
    clientId: string;
    access: string;
    permissions: readonly string[];
    scope: string;
    resource: string;
    createdBy: string;
  }): Promise<void> {
    await new DrizzleApiKeyRepository(this.tx, this.orgId).createServiceAccount({
      serviceAccountId: g.serviceAccountId,
      grantId: g.authzGrantId,
      name: g.name,
      permissions: g.permissions,
      createdBy: g.createdBy,
    });
    await this.tx.insert(s.oauthGrant).values({
      id: g.grantId,
      orgId: this.orgId,
      clientId: g.clientId,
      serviceAccountId: g.serviceAccountId,
      access: g.access,
      scope: g.scope,
      resource: g.resource,
      createdBy: g.createdBy,
    });
  }

  /** A consent that still stands, with its service account alive. */
  async findLive(grantId: string): Promise<{
    id: string;
    serviceAccountId: string;
    clientId: string;
    access: string;
    scope: string;
  } | null> {
    const [r] = await rawRows<{
      id: string;
      serviceAccountId: string;
      clientId: string;
      access: string;
      scope: string;
    }>(
      this.tx,
      sql`select g.id, g.service_account_id as "serviceAccountId", g.client_id as "clientId", g.access, g.scope
        from oauth_grant g join service_account sa on sa.id = g.service_account_id
        where g.id = ${grantId} and g.org_id = ${this.orgId} and g.revoked_at is null and sa.archived_at is null`,
    );
    return r ?? null;
  }

  async findByServiceAccount(
    serviceAccountId: string,
  ): Promise<{ id: string; clientId: string } | null> {
    const [r] = await this.tx
      .select({ id: s.oauthGrant.id, clientId: s.oauthGrant.clientId })
      .from(s.oauthGrant)
      .where(eq(s.oauthGrant.serviceAccountId, serviceAccountId))
      .limit(1);
    return r ?? null;
  }

  /**
   * An access token: an `api_key` row with an expiry, so `resolve_api_key` and
   * `withPermission` treat it like any key. Expired tokens of the same connection are
   * cleared on the way, so a long-lived connection does not pile up rows.
   */
  async issueAccessToken(t: {
    apiKeyId: string;
    serviceAccountId: string;
    access: string;
    prefix: string;
    keyHash: string;
    expiresAt: string;
    now: string;
  }): Promise<void> {
    await this.tx
      .delete(s.apiKey)
      .where(and(eq(s.apiKey.serviceAccountId, t.serviceAccountId), lt(s.apiKey.expiresAt, t.now)));
    await this.tx.insert(s.apiKey).values({
      id: t.apiKeyId,
      orgId: this.orgId,
      serviceAccountId: t.serviceAccountId,
      prefix: t.prefix,
      keyHash: t.keyHash,
      scopes: [t.access],
      expiresAt: t.expiresAt,
    });
  }

  /** RFC 7009 on an access token: that token only. */
  async revokeAccessToken(apiKeyId: string, at: string): Promise<void> {
    await this.tx
      .update(s.apiKey)
      .set({ revokedAt: at })
      .where(and(eq(s.apiKey.id, apiKeyId), isNull(s.apiKey.revokedAt)));
  }

  /**
   * Disconnect: the consent, its service account and grant, every access token and every
   * refresh token, at once. The next request with any of them is a 401.
   */
  async revoke(grantId: string, at: string): Promise<{ name: string } | null> {
    const [g] = await this.tx
      .update(s.oauthGrant)
      .set({ revokedAt: at })
      .where(and(eq(s.oauthGrant.id, grantId), isNull(s.oauthGrant.revokedAt)))
      .returning({ sa: s.oauthGrant.serviceAccountId });
    if (!g) return null;
    await new DrizzleOAuthStore(this.tx).revokeRefreshTokensOfGrant(grantId, at);
    await this.tx
      .update(s.apiKey)
      .set({ revokedAt: at })
      .where(and(eq(s.apiKey.serviceAccountId, g.sa), isNull(s.apiKey.revokedAt)));
    await this.tx
      .update(s.grant)
      .set({ revokedAt: at })
      .where(and(eq(s.grant.subjectType, "service_account"), eq(s.grant.subjectId, g.sa)));
    const [sa] = await this.tx
      .update(s.serviceAccount)
      .set({ archivedAt: at })
      .where(eq(s.serviceAccount.id, g.sa))
      .returning({ name: s.serviceAccount.name });
    return sa ? { name: sa.name } : null;
  }

  /** Connected apps still standing, newest first, with when each last called us. */
  async list(): Promise<ConnectedAppRow[]> {
    return rawRows<ConnectedAppRow>(
      this.tx,
      sql`select g.id as "grantId", g.service_account_id as "serviceAccountId", sa.name,
          c.client_name as "clientName", g.access, g.created_at as "createdAt",
          (select max(k.last_used_at) from api_key k where k.service_account_id = g.service_account_id) as "lastUsedAt",
          u.name as "createdByName"
        from oauth_grant g
        join service_account sa on sa.id = g.service_account_id
        join oauth_client c on c.client_id = g.client_id
        left join "user" u on u.id = g.created_by
        where g.org_id = ${this.orgId} and g.revoked_at is null and sa.archived_at is null
        order by g.created_at desc`,
    );
  }
}
