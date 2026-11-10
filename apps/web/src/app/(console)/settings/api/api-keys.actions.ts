"use server";

import { revalidatePath } from "next/cache";
import {
  apiKeyPermissions,
  apiKeyVisiblePrefix,
  formatApiKey,
  hashApiKey,
  Id,
  isApiKeyAccess,
  type ApiKeyAccess,
} from "@pms/core";
import { evaluate, PERMISSIONS, type RoleKey } from "@pms/authz";
import { DrizzleApiKeyRepository, DrizzleIdentityRepository, type ApiKeyRow } from "@pms/db";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";

export interface CreateKeyState {
  error?: string;
  /** Shown once, right after creation; never stored, never returned again. */
  secret?: string;
  name?: string;
  access?: ApiKeyAccess;
}

export const listApiKeys = withPermission<[], ApiKeyRow[]>(
  "api_key:read",
  { scope: "organization", audit: false },
  async (ctx) => new DrizzleApiKeyRepository(ctx.tx, ctx.orgId).list(),
);

/**
 * The access level's permissions, narrowed to what the creator holds at organization scope:
 * a key never does more than the person who made it (spec 02 §2.5, no escalation by authoring).
 */
async function permissionsFor(ctx: ActorCtx, access: ApiKeyAccess): Promise<string[]> {
  const grants = await new DrizzleIdentityRepository(ctx.tx).listGrantsForSubject(
    "user",
    ctx.userId,
  );
  const graph = { orgId: ctx.orgId, groupProperties: new Map() };
  const mine = grants.map((g) => ({
    role: (g.roleKey ?? "viewer") as RoleKey,
    scope: { kind: g.scopeType, id: g.scopeId },
    ...(g.overrides ? { overrides: g.overrides as never } : {}),
    expiresAt: g.expiresAt,
  }));
  return apiKeyPermissions(access, PERMISSIONS).filter(
    (p) =>
      evaluate({
        grants: mine,
        permission: p,
        target: { kind: "organization", id: ctx.orgId },
        graph,
      }).allow,
  );
}

/** Settings → API & AI: a key for Claude (or any script), with one of four access levels. */
export const createApiKeyAction = withPermission<[CreateKeyState, FormData], CreateKeyState>(
  "api_key:create",
  {
    scope: "organization",
    subject: () => ({ kind: "api_key", id: "new" }),
    auditInput: (_prev, fd) => ({ name: fd.get("name"), access: fd.get("access") }),
  },
  async (ctx, _prev, fd) => {
    const name = String(fd.get("name") ?? "").trim();
    const access = String(fd.get("access") ?? "");
    if (name.length < 1 || name.length > 60) return { error: "name" };
    if (!isApiKeyAccess(access)) return { error: "access" };
    const c = await container();
    const secret = formatApiKey(c.crypto.randomToken(30));
    await new DrizzleApiKeyRepository(ctx.tx, ctx.orgId).create({
      apiKeyId: Id.next(),
      serviceAccountId: Id.next(),
      grantId: Id.next(),
      name,
      access,
      permissions: await permissionsFor(ctx, access),
      prefix: apiKeyVisiblePrefix(secret),
      keyHash: hashApiKey(c.sha256Hex, secret),
      createdBy: ctx.userId,
    });
    revalidatePath("/settings/api");
    return { secret, name, access };
  },
);

export const revokeApiKeyAction = withPermission<[FormData], void>(
  "api_key:revoke",
  { scope: "organization", subject: (fd) => ({ kind: "api_key", id: String(fd.get("keyId")) }) },
  async (ctx, fd) => {
    const c = await container();
    await new DrizzleApiKeyRepository(ctx.tx, ctx.orgId).revoke(
      String(fd.get("keyId")),
      c.clock.now().toString(),
    );
    revalidatePath("/settings/api");
  },
);
