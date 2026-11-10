import { apiKeyPermissions, type ApiKeyAccess } from "@pms/core";
import { evaluate, PERMISSIONS, type RoleKey } from "@pms/authz";
import { DrizzleIdentityRepository } from "@pms/db";
import type { ActorCtx } from "./with-permission";

/**
 * The access level's permissions, narrowed to what the acting person holds at organization
 * scope: a key, or an app connected by sign-in, never does more than the person who made it
 * (spec 02 §2.5, no escalation by authoring; spec 04 §4.7a/b).
 */
export async function permissionsFor(ctx: ActorCtx, access: ApiKeyAccess): Promise<string[]> {
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
