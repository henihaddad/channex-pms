import { and, eq, isNull, sql } from "drizzle-orm";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

/** One row of the key list on Settings → API & AI. Never the secret, never its hash. */
export interface ApiKeyRow {
  id: string;
  serviceAccountId: string;
  name: string;
  /** The access level the host picked (`full`, `read_only`, `messages`, `prices`). */
  access: string;
  /** `otab_AbC12xY`: enough to recognise the key. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
}

/** What a presented key resolves to, before any tenant context exists. */
export interface ResolvedApiKey {
  orgId: string;
  apiKeyId: string;
  serviceAccountId: string;
  name: string;
  scopes: string[];
  createdBy: string | null;
}

/**
 * API keys (spec 04 §4.7a, spec 02 §2.8): one service account per key, holding the access
 * level's permissions as an explicit grant (role `service_account`, overrides.allow), so the
 * permission engine evaluates a key exactly like a person.
 */
export class DrizzleApiKeyRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  /** Service account, its grant at organization scope, and the key: one transaction. */
  async create(k: {
    apiKeyId: string;
    serviceAccountId: string;
    grantId: string;
    name: string;
    access: string;
    permissions: readonly string[];
    prefix: string;
    keyHash: string;
    createdBy: string;
  }): Promise<void> {
    await this.tx.insert(s.serviceAccount).values({
      id: k.serviceAccountId,
      orgId: this.orgId,
      name: k.name,
      permissions: [...k.permissions],
    });
    await this.tx.insert(s.grant).values({
      id: k.grantId,
      orgId: this.orgId,
      subjectType: "service_account",
      subjectId: k.serviceAccountId,
      roleKey: "service_account",
      scopeType: "organization",
      scopeId: this.orgId,
      overrides: { allow: [...k.permissions] },
      createdBy: k.createdBy,
    });
    await this.tx.insert(s.apiKey).values({
      id: k.apiKeyId,
      orgId: this.orgId,
      serviceAccountId: k.serviceAccountId,
      prefix: k.prefix,
      keyHash: k.keyHash,
      scopes: [k.access],
    });
  }

  /** Newest first; revoked keys stay listed (greyed) so the activity log still has a name. */
  async list(): Promise<ApiKeyRow[]> {
    return rawRows<ApiKeyRow>(
      this.tx,
      sql`select k.id, k.service_account_id as "serviceAccountId", sa.name, coalesce(k.scopes->>0, 'full') as access, k.prefix,
        k.created_at as "createdAt", k.last_used_at as "lastUsedAt", k.revoked_at as "revokedAt",
        g.created_by as "createdBy", u.name as "createdByName"
        from api_key k join service_account sa on sa.id = k.service_account_id
        left join lateral (select created_by from "grant" where subject_type = 'service_account' and subject_id = k.service_account_id order by created_at limit 1) g on true
        left join "user" u on u.id = g.created_by
        where k.org_id = ${this.orgId}
        order by k.revoked_at is not null, k.created_at desc`,
    );
  }

  /** Revoking ends the key, its grant and its service account at once; the next request is a 401. */
  async revoke(apiKeyId: string, at: string): Promise<{ name: string } | null> {
    const [k] = await this.tx
      .select({ sa: s.apiKey.serviceAccountId })
      .from(s.apiKey)
      .where(and(eq(s.apiKey.id, apiKeyId), isNull(s.apiKey.revokedAt)))
      .limit(1);
    if (!k) return null;
    await this.tx.update(s.apiKey).set({ revokedAt: at }).where(eq(s.apiKey.id, apiKeyId));
    await this.tx
      .update(s.grant)
      .set({ revokedAt: at })
      .where(and(eq(s.grant.subjectType, "service_account"), eq(s.grant.subjectId, k.sa)));
    const [sa] = await this.tx
      .update(s.serviceAccount)
      .set({ archivedAt: at })
      .where(eq(s.serviceAccount.id, k.sa))
      .returning({ name: s.serviceAccount.name });
    return sa ? { name: sa.name } : null;
  }
}

/**
 * Map a key's hash to its organization and service account (outside any tenant: the
 * SECURITY DEFINER function `resolve_api_key`), stamping last_used_at at most once a minute.
 * Null for an unknown, revoked or expired key.
 */
export async function resolveApiKey(
  executor: { execute(q: ReturnType<typeof sql>): Promise<unknown> },
  keyHash: string,
): Promise<ResolvedApiKey | null> {
  const [r] = await rawRows<{
    org_id: string;
    api_key_id: string;
    service_account_id: string;
    key_name: string;
    scopes: string[];
    created_by: string | null;
  }>(
    executor,
    sql`select org_id, api_key_id, service_account_id, key_name, scopes, created_by from resolve_api_key(${keyHash})`,
  );
  return r
    ? {
        orgId: r.org_id,
        apiKeyId: r.api_key_id,
        serviceAccountId: r.service_account_id,
        name: r.key_name,
        scopes: r.scopes,
        createdBy: r.created_by,
      }
    : null;
}
