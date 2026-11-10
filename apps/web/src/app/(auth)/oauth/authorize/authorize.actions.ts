"use server";

import {
  OAUTH_CODE_TTL_SECONDS,
  authorizationRedirect,
  checkAuthorizationRequest,
  connectionName,
  Id,
  isApiKeyAccess,
  oauthSecret,
} from "@pms/core";
import { DrizzleOAuthGrantRepository, DrizzleOAuthStore } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { permissionsFor } from "@/server/key-permissions";
import { oauthUrls } from "@/server/oauth";
import { AUTHORIZE_PARAMS } from "@/server/oauth-consent";

export interface ConsentState {
  /** Where the browser goes next: the client's redirect URI with the code. */
  redirectTo?: string;
  error?: "invalid_request" | "access";
}

const params = (fd: FormData) =>
  Object.fromEntries(
    AUTHORIZE_PARAMS.flatMap((k) => {
      const v = fd.get(k);
      return typeof v === "string" ? [[k, v]] : [];
    }),
  ) as Record<string, string>;

/**
 * Approve an MCP client (spec 04 §4.7b). Persona: the host who runs the business through
 * Claude. The same right as creating an API key, in the organization the person picked: a
 * service account named after the client ("Claude (claude.ai)") with the access level's
 * permissions narrowed to the person's own, the consent row, and a single-use code bound to
 * the client, redirect URI, PKCE challenge and resource.
 */
export const approveAuthorizationAction = withPermission<[ConsentState, FormData], ConsentState>(
  "api_key:create",
  {
    scope: "organization",
    org: (_prev, fd) => String(fd.get("orgId") ?? "") || null,
    subject: (_prev, fd) => ({ kind: "oauth_client", id: String(fd.get("client_id") ?? "") }),
    auditInput: (_prev, fd) => ({
      client_id: fd.get("client_id"),
      redirect_uri: fd.get("redirect_uri"),
      access: fd.get("access"),
    }),
  },
  async (ctx, _prev, fd) => {
    const access = String(fd.get("access") ?? "");
    if (!isApiKeyAccess(access)) return { error: "access" };
    const c = await container();
    const urls = await oauthUrls();
    const p = params(fd);
    const store = new DrizzleOAuthStore(ctx.tx);
    const client = p.client_id ? await store.findClient(p.client_id) : null;
    const check = checkAuthorizationRequest(p, client, urls.resource);
    if (check.kind !== "ok" || !client) return { error: "invalid_request" };
    const r = check.request;
    const grantId = Id.next();
    const serviceAccountId = Id.next();
    await new DrizzleOAuthGrantRepository(ctx.tx, ctx.orgId).create({
      grantId,
      serviceAccountId,
      authzGrantId: Id.next(),
      name: connectionName(client.clientName, r.redirectUri),
      clientId: client.clientId,
      access,
      permissions: await permissionsFor(ctx, access),
      scope: r.scope,
      resource: r.resource,
      createdBy: ctx.userId,
    });
    const code = oauthSecret.code(c.crypto.randomToken(30));
    await store.insertCode({
      id: Id.next(),
      codeHash: c.sha256Hex(code),
      grantId,
      orgId: ctx.orgId,
      serviceAccountId,
      clientId: client.clientId,
      redirectUri: r.redirectUri,
      codeChallenge: r.codeChallenge,
      resource: r.resource,
      expiresAt: c.clock.now().add({ seconds: OAUTH_CODE_TTL_SECONDS }).toString(),
    });
    return {
      redirectTo: authorizationRedirect(r.redirectUri, { code, state: r.state, iss: urls.issuer }),
    };
  },
);
