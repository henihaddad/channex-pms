import type {
  OAuthClientInformationFull,
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_REFRESH_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_TTL_DAYS,
  OAUTH_REGISTRATIONS_PER_IP_PER_HOUR,
  OAUTH_SCOPE,
  apiKeyVisiblePrefix,
  checkAuthorizationCode,
  checkRefreshToken,
  constantTimeEqual,
  hashApiKey,
  Id,
  isOAuthAccessToken,
  mcpResource,
  oauthSecret,
  validateClientMetadata,
  type OAuthErrorCode,
} from "@pms/core";
import {
  DrizzleOAuthGrantRepository,
  DrizzleOAuthStore,
  resolveApiKey,
  withoutTenant,
  withTenant,
  type OAuthClientRow,
} from "@pms/db";
import { container } from "./container";
import { clientIp } from "./session";

/**
 * "Sign in with OTAbridge" (spec 04 §4.7b): the authorization server and the MCP server's
 * protected resource metadata, per the MCP authorization spec (2025-06-18). The routes under
 * `app/oauth` are one-line adapters onto these; the rules live in `@pms/core` (agent/oauth).
 */

/** Every URL a client discovers, from `NEXT_PUBLIC_APP_URL` (the issuer). */
export async function oauthUrls() {
  const base = (await container()).config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return {
    issuer: base,
    resource: mcpResource(base),
    /** RFC 9728 §3.1: the well-known path with the resource's path appended. */
    resourceMetadata: `${base}/.well-known/oauth-protected-resource/api/mcp`,
    authorization: `${base}/oauth/authorize`,
    token: `${base}/oauth/token`,
    registration: `${base}/oauth/register`,
    revocation: `${base}/oauth/revoke`,
  };
}

const CLIENT_AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"];

/** Browser-based clients (an MCP inspector) read metadata and call the token endpoint cross-origin. */
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "no-store", pragma: "no-cache", ...extra },
  });
}

/** RFC 6749 §5.2 error body. `invalid_client` is a 401 with a challenge. */
export function oauthError(error: OAuthErrorCode, description: string, status = 400): Response {
  return json(
    { error, error_description: description },
    status,
    status === 401 ? { "www-authenticate": 'Basic realm="otabridge"' } : {},
  );
}

/** RFC 9728: where the MCP server's authorization server is, and how to present a token. */
export async function protectedResourceMetadata(): Promise<Response> {
  const u = await oauthUrls();
  const body: OAuthProtectedResourceMetadata = {
    resource: u.resource,
    authorization_servers: [u.issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [OAUTH_SCOPE],
    resource_name: "OTAbridge",
  };
  return json(body, 200, { "cache-control": "public, max-age=3600" });
}

/** RFC 8414: the authorization server's endpoints and what it supports. */
export async function authorizationServerMetadata(): Promise<Response> {
  const u = await oauthUrls();
  const body: OAuthMetadata & { authorization_response_iss_parameter_supported: boolean } = {
    issuer: u.issuer,
    authorization_endpoint: u.authorization,
    token_endpoint: u.token,
    registration_endpoint: u.registration,
    revocation_endpoint: u.revocation,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: CLIENT_AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: CLIENT_AUTH_METHODS,
    authorization_response_iss_parameter_supported: true,
  };
  return json(body, 200, { "cache-control": "public, max-age=3600" });
}

// ---- registration (RFC 7591) ----------------------------------------------------------------

export async function registerClient(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON");
  }
  const v = validateClientMetadata(raw);
  if (!v.ok) return oauthError(v.error, v.description);
  const c = await container();
  const ip = (await clientIp()) ?? null;
  const store = (fn: (s: DrizzleOAuthStore) => Promise<unknown>) =>
    withoutTenant(c.db.db, (tx) => fn(new DrizzleOAuthStore(tx)));
  if (ip) {
    const since = c.clock.now().subtract({ hours: 1 }).toString();
    let recent = 0;
    await store(async (s) => (recent = await s.registrationsSince(ip, since)));
    if (recent >= OAUTH_REGISTRATIONS_PER_IP_PER_HOUR)
      return json(
        { error: "temporarily_unavailable", error_description: "Too many registrations" },
        429,
        { "retry-after": "3600" },
      );
  }
  const m = v.value;
  const clientId = oauthSecret.clientId(c.crypto.randomToken(18));
  const secret =
    m.tokenEndpointAuthMethod === "none" ? null : `otab_cs_${c.crypto.randomToken(30)}`;
  let createdAt = "";
  await store(async (s) => {
    ({ createdAt } = await s.registerClient({
      id: Id.next(),
      clientId,
      clientSecretHash: secret ? c.sha256Hex(secret) : null,
      clientName: m.clientName,
      redirectUris: m.redirectUris,
      tokenEndpointAuthMethod: m.tokenEndpointAuthMethod,
      grantTypes: m.grantTypes,
      clientUri: m.clientUri,
      scope: m.scope,
      registeredIp: ip,
    }));
  });
  const body: OAuthClientInformationFull = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.parse(createdAt) / 1000),
    client_name: m.clientName,
    redirect_uris: m.redirectUris,
    grant_types: m.grantTypes,
    response_types: m.responseTypes,
    token_endpoint_auth_method: m.tokenEndpointAuthMethod,
    ...(m.clientUri ? { client_uri: m.clientUri } : {}),
    ...(m.scope ? { scope: m.scope } : {}),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
  return json(body, 201);
}

// ---- client authentication at the token and revocation endpoints ----------------------------

/**
 * `client_id` (public client), plus its secret for a client that registered one, by
 * `client_secret_post` or HTTP Basic (RFC 6749 §2.3.1).
 */
async function authenticateClient(
  form: URLSearchParams,
  authorization: string | null,
): Promise<OAuthClientRow | null> {
  let id = form.get("client_id");
  let secret = form.get("client_secret");
  if (authorization?.startsWith("Basic ")) {
    try {
      const [u, p] = atob(authorization.slice(6).trim()).split(":");
      id = decodeURIComponent(u ?? "");
      secret = decodeURIComponent(p ?? "");
    } catch {
      return null;
    }
  }
  if (!id) return null;
  const c = await container();
  const client = await withoutTenant(c.db.db, (tx) => new DrizzleOAuthStore(tx).findClient(id));
  if (!client) return null;
  if (client.clientSecretHash === null) return client;
  return secret && constantTimeEqual(c.sha256Hex(secret), client.clientSecretHash) ? client : null;
}

async function readForm(req: Request): Promise<URLSearchParams | null> {
  if (!req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) return null;
  return new URLSearchParams(await req.text());
}

/** Withdraw a consent: its service account, every access and refresh token (a replay, a theft signal). */
async function revokeGrant(orgId: string, grantId: string): Promise<void> {
  const c = await container();
  await withTenant(c.db.db, { orgId, actor: { type: "system", id: "oauth" } }, (tx) =>
    new DrizzleOAuthGrantRepository(tx, orgId).revoke(grantId, c.clock.now().toString()),
  );
}

/** A fresh access token (an expiring API key) and refresh token for a standing consent. */
async function issueTokens(g: {
  orgId: string;
  grantId: string;
  clientId: string;
  resource: string;
}): Promise<OAuthTokens | null> {
  const c = await container();
  const now = c.clock.now();
  const access = oauthSecret.access(c.crypto.randomToken(30));
  const refresh = oauthSecret.refresh(c.crypto.randomToken(30));
  return withTenant(
    c.db.db,
    { orgId: g.orgId, actor: { type: "system", id: "oauth" } },
    async (tx) => {
      const grants = new DrizzleOAuthGrantRepository(tx, g.orgId);
      const live = await grants.findLive(g.grantId);
      if (!live || live.clientId !== g.clientId) return null;
      await grants.issueAccessToken({
        apiKeyId: Id.next(),
        serviceAccountId: live.serviceAccountId,
        access: live.access,
        prefix: apiKeyVisiblePrefix(access),
        keyHash: hashApiKey(c.sha256Hex, access),
        expiresAt: now.add({ seconds: OAUTH_ACCESS_TOKEN_TTL_SECONDS }).toString(),
        now: now.toString(),
      });
      await new DrizzleOAuthStore(tx).insertRefreshToken({
        id: Id.next(),
        tokenHash: c.sha256Hex(refresh),
        grantId: g.grantId,
        orgId: g.orgId,
        serviceAccountId: live.serviceAccountId,
        clientId: g.clientId,
        resource: g.resource,
        expiresAt: now.add({ hours: 24 * OAUTH_REFRESH_TOKEN_TTL_DAYS }).toString(),
      });
      return {
        access_token: access,
        token_type: "Bearer",
        expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: refresh,
        scope: live.scope,
      };
    },
  );
}

// ---- token endpoint (OAuth 2.1 §3.2) ----------------------------------------------------------

export async function tokenEndpoint(req: Request): Promise<Response> {
  const form = await readForm(req);
  if (!form) return oauthError("invalid_request", "Use application/x-www-form-urlencoded");
  const client = await authenticateClient(form, req.headers.get("authorization"));
  if (!client) return oauthError("invalid_client", "Unknown client or bad credentials", 401);
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") return exchangeCode(form, client);
  if (grantType === "refresh_token") return refreshTokens(form, client);
  return oauthError(
    "unsupported_grant_type",
    "grant_type must be authorization_code or refresh_token",
  );
}

async function exchangeCode(form: URLSearchParams, client: OAuthClientRow): Promise<Response> {
  const code = form.get("code");
  if (!code) return oauthError("invalid_request", "code is required");
  const c = await container();
  const now = c.clock.now().toString();
  const found = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOAuthStore(tx).consumeCode(c.sha256Hex(code), now),
  );
  if (!found) return oauthError("invalid_grant", "Unknown authorization code");
  const check = checkAuthorizationCode(
    found.code,
    {
      firstUse: found.firstUse,
      clientId: client.clientId,
      redirectUri: form.get("redirect_uri") ?? undefined,
      verifier: form.get("code_verifier") ?? undefined,
      resource: form.get("resource") ?? undefined,
      now,
    },
    c.sha256Hex,
  );
  if (!check.ok) {
    // the code is burned either way; a replay also takes back what the first use issued
    // (OAuth 2.1 §4.1.3), and a failed first use leaves a consent nothing can complete
    await revokeGrant(found.code.orgId, found.code.grantId);
    return oauthError(check.error, check.description);
  }
  const tokens = await issueTokens({
    orgId: found.code.orgId,
    grantId: found.code.grantId,
    clientId: client.clientId,
    resource: found.code.resource,
  });
  return tokens ? json(tokens) : oauthError("invalid_grant", "The connection was revoked");
}

async function refreshTokens(form: URLSearchParams, client: OAuthClientRow): Promise<Response> {
  const presented = form.get("refresh_token");
  if (!presented?.startsWith(OAUTH_REFRESH_TOKEN_PREFIX))
    return oauthError("invalid_grant", "Unknown refresh token");
  const c = await container();
  const now = c.clock.now().toString();
  const row = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOAuthStore(tx).findRefreshToken(c.sha256Hex(presented)),
  );
  if (!row) return oauthError("invalid_grant", "Unknown refresh token");
  const check = checkRefreshToken(row, {
    clientId: client.clientId,
    resource: form.get("resource") ?? undefined,
    now,
  });
  if (!check.ok) {
    // a rotated token presented again: someone else holds the chain (OAuth 2.1 §4.3.1)
    if (check.reuse && row.clientId === client.clientId) await revokeGrant(row.orgId, row.grantId);
    return oauthError(check.error, check.description);
  }
  const rotated = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOAuthStore(tx).rotateRefreshToken(row.id, now),
  );
  if (!rotated) return oauthError("invalid_grant", "Refresh token already used");
  const tokens = await issueTokens({
    orgId: row.orgId,
    grantId: row.grantId,
    clientId: client.clientId,
    resource: row.resource,
  });
  return tokens ? json(tokens) : oauthError("invalid_grant", "The connection was revoked");
}

// ---- revocation (RFC 7009) ------------------------------------------------------------------

/**
 * A refresh token ends the whole connection (RFC 7009 §2.1); an access token ends itself.
 * Unknown tokens, and tokens of another client, get the same 200: nothing to learn here.
 */
export async function revocationEndpoint(req: Request): Promise<Response> {
  const form = await readForm(req);
  if (!form) return oauthError("invalid_request", "Use application/x-www-form-urlencoded");
  const client = await authenticateClient(form, req.headers.get("authorization"));
  if (!client) return oauthError("invalid_client", "Unknown client or bad credentials", 401);
  const token = form.get("token");
  if (!token) return oauthError("invalid_request", "token is required");
  const c = await container();
  if (token.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
    const row = await withoutTenant(c.db.db, (tx) =>
      new DrizzleOAuthStore(tx).findRefreshToken(c.sha256Hex(token)),
    );
    if (row && row.clientId === client.clientId) await revokeGrant(row.orgId, row.grantId);
  } else if (isOAuthAccessToken(token)) {
    const key = await withoutTenant(c.db.db, (tx) =>
      resolveApiKey(tx, hashApiKey(c.sha256Hex, token)),
    );
    if (key)
      await withTenant(
        c.db.db,
        { orgId: key.orgId, actor: { type: "system", id: "oauth" } },
        async (tx) => {
          const grants = new DrizzleOAuthGrantRepository(tx, key.orgId);
          const g = await grants.findByServiceAccount(key.serviceAccountId);
          if (g?.clientId === client.clientId)
            await grants.revokeAccessToken(key.apiKeyId, c.clock.now().toString());
        },
      );
  }
  return new Response(null, {
    status: 200,
    headers: { ...CORS_HEADERS, "cache-control": "no-store" },
  });
}
