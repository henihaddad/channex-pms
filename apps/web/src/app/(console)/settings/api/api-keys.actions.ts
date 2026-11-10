"use server";

import { revalidatePath } from "next/cache";
import {
  apiKeyVisiblePrefix,
  formatApiKey,
  hashApiKey,
  Id,
  isApiKeyAccess,
  isOAuthAccessToken,
  type ApiKeyAccess,
} from "@pms/core";
import {
  DrizzleApiKeyRepository,
  DrizzleOAuthGrantRepository,
  type ApiKeyRow,
  type ConnectedAppRow,
} from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { permissionsFor } from "@/server/key-permissions";

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
    // a key never looks like a connected app's access token (`otab_oat_…`), which only the MCP server takes
    let secret = formatApiKey(c.crypto.randomToken(30));
    while (isOAuthAccessToken(secret)) secret = formatApiKey(c.crypto.randomToken(30));
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

/** Apps connected by "Sign in with OTAbridge" (spec 04 §4.7b): Claude on claude.ai, and the like. */
export const listConnectedApps = withPermission<[], ConnectedAppRow[]>(
  "api_key:read",
  { scope: "organization", audit: false },
  async (ctx) => new DrizzleOAuthGrantRepository(ctx.tx, ctx.orgId).list(),
);

/** Disconnect: the consent, its service account and every token it holds end at once. */
export const disconnectAppAction = withPermission<[FormData], void>(
  "api_key:revoke",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "oauth_grant", id: String(fd.get("grantId")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    await new DrizzleOAuthGrantRepository(ctx.tx, ctx.orgId).revoke(
      String(fd.get("grantId")),
      c.clock.now().toString(),
    );
    revalidatePath("/settings/api");
  },
);
