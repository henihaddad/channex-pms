/**
 * "Sign in with OTAbridge" for MCP clients (spec 04 §4.7b, the MCP authorization spec of
 * 2025-06-18: OAuth 2.1 with PKCE, RFC 8414 metadata, RFC 7591 registration, RFC 8707
 * resource indicators, RFC 9728 protected resource metadata, RFC 7009 revocation).
 *
 * Framework-free rules only: token shapes, PKCE, redirect URI policy, client metadata
 * validation, and the decisions on a presented code or refresh token. Hashing and random
 * bytes come in through the crypto port's functions; storage is the db package's.
 */
import { API_KEY_PREFIX } from "./api-key.js";

/** An access token is an API key (same table, same resolver) with an expiry and its own prefix. */
export const OAUTH_ACCESS_TOKEN_PREFIX = `${API_KEY_PREFIX}oat_`;
export const OAUTH_REFRESH_TOKEN_PREFIX = `${API_KEY_PREFIX}ort_`;
export const OAUTH_CODE_PREFIX = `${API_KEY_PREFIX}oac_`;
export const OAUTH_CLIENT_ID_PREFIX = "otab_client_";

/** Single-use, ten minutes at most (OAuth 2.1 §4.1.2); five is plenty for a redirect. */
export const OAUTH_CODE_TTL_SECONDS = 300;
/** Short-lived, as the MCP spec asks: a leaked token is worth an hour. */
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 3600;
/** Rotated on every use; a connection left alone this long signs in again. */
export const OAUTH_REFRESH_TOKEN_TTL_DAYS = 60;
/** The one scope: the MCP server. What the connection may do is its access level. */
export const OAUTH_SCOPE = "mcp";
export const OAUTH_MAX_REDIRECT_URIS = 10;
export const OAUTH_CLIENT_NAME_MAX = 100;
/** Dynamic registration is open by design; this caps how fast one address can fill the table. */
export const OAUTH_REGISTRATIONS_PER_IP_PER_HOUR = 20;

export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "unsupported_response_type"
  | "invalid_scope"
  | "invalid_target"
  | "access_denied"
  | "invalid_redirect_uri"
  | "invalid_client_metadata"
  | "temporarily_unavailable";

export interface OAuthError {
  error: OAuthErrorCode;
  description: string;
}

const oauthError = (error: OAuthErrorCode, description: string): OAuthError => ({
  error,
  description,
});

export type TokenEndpointAuthMethod = "none" | "client_secret_post" | "client_secret_basic";
export const TOKEN_ENDPOINT_AUTH_METHODS: readonly TokenEndpointAuthMethod[] = [
  "none",
  "client_secret_post",
  "client_secret_basic",
];

// ---- PKCE (RFC 7636, S256 only) ----------------------------------------------------------

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isCodeVerifier(v: unknown): v is string {
  return typeof v === "string" && VERIFIER.test(v);
}

/** BASE64URL(SHA256(verifier)) is always 43 characters. */
export function isCodeChallenge(v: unknown): v is string {
  return typeof v === "string" && CHALLENGE.test(v);
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Hex digest to unpadded base64url, without Buffer (core runs on any JS runtime). */
export function hexToBase64Url(hex: string): string {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new RangeError("not a hex string");
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    out += B64URL[a >> 2]!;
    out += B64URL[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += B64URL[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += B64URL[c & 63]!;
  }
  return out;
}

/** The S256 challenge for a verifier. */
export function pkceChallenge(verifier: string, sha256Hex: (s: string) => string): string {
  return hexToBase64Url(sha256Hex(verifier));
}

/** Compare without an early exit, so timing says nothing about how much matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function verifyPkce(
  verifier: unknown,
  challenge: string,
  sha256Hex: (s: string) => string,
): boolean {
  return (
    isCodeVerifier(verifier) && constantTimeEqual(pkceChallenge(verifier, sha256Hex), challenge)
  );
}

// ---- redirect URIs -----------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * The MCP rule: a redirect URI is HTTPS, or HTTP on the loopback interface (a desktop or CLI
 * client listening locally). Never a fragment, never credentials in the URL.
 * Null when acceptable; otherwise why not.
 */
export function redirectUriProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return "not a URL";
  const u = parseUrl(raw);
  if (!u) return "not a URL";
  if (u.hash || raw.includes("#")) return "must not contain a fragment";
  if (u.username || u.password) return "must not contain credentials";
  if (u.protocol === "https:") return u.hostname ? null : "needs a host";
  if (u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname)) return null;
  return "must use https, or http on localhost / 127.0.0.1";
}

export function isLoopbackRedirect(raw: string): boolean {
  const u = parseUrl(raw);
  return !!u && u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname);
}

/**
 * Exact string match against a registered URI (MCP spec, OAuth 2.1 §2.3.1), with the one
 * exception OAuth 2.1 §8.4.2 requires: a loopback URI may come back on any port.
 */
export function redirectUriMatches(registered: readonly string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  if (!isLoopbackRedirect(presented)) return false;
  const p = new URL(presented);
  return registered.some((r) => {
    if (!isLoopbackRedirect(r)) return false;
    const u = new URL(r);
    return u.hostname === p.hostname && u.pathname === p.pathname && u.search === p.search;
  });
}

/** What the consent screen and the connection's name show: the redirect's host. */
export function redirectHost(raw: string): string {
  const u = parseUrl(raw);
  if (!u) return raw;
  if (LOOPBACK_HOSTS.has(u.hostname)) return "localhost";
  return u.hostname.replace(/^www\./, "");
}

/** "Claude (claude.ai)": the service account's name, so the activity log reads "via Claude (claude.ai)". */
export function connectionName(clientName: string, redirectUri: string): string {
  const name = clientName.trim().slice(0, OAUTH_CLIENT_NAME_MAX) || "MCP client";
  return `${name} (${redirectHost(redirectUri)})`;
}

// ---- client registration (RFC 7591) -------------------------------------------------------

export interface ClientRegistration {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  grantTypes: string[];
  responseTypes: string[];
  clientUri: string | null;
  scope: string | null;
}

const SUPPORTED_GRANTS = new Set(["authorization_code", "refresh_token"]);

/** Validate the registration request body. Unknown fields are ignored, as RFC 7591 §2 allows. */
export function validateClientMetadata(
  raw: unknown,
): { ok: true; value: ClientRegistration } | ({ ok: false } & OAuthError) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, ...oauthError("invalid_client_metadata", "Body must be a JSON object") };
  const m = raw as Record<string, unknown>;
  const uris = m.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0)
    return { ok: false, ...oauthError("invalid_redirect_uri", "redirect_uris is required") };
  if (uris.length > OAUTH_MAX_REDIRECT_URIS)
    return {
      ok: false,
      ...oauthError("invalid_redirect_uri", `At most ${OAUTH_MAX_REDIRECT_URIS} redirect_uris`),
    };
  for (const u of uris) {
    const problem = redirectUriProblem(u);
    if (problem)
      return {
        ok: false,
        ...oauthError("invalid_redirect_uri", `redirect_uri ${String(u)}: ${problem}`),
      };
  }
  const method = m.token_endpoint_auth_method ?? "none";
  if (!TOKEN_ENDPOINT_AUTH_METHODS.includes(method as TokenEndpointAuthMethod))
    return {
      ok: false,
      ...oauthError(
        "invalid_client_metadata",
        `token_endpoint_auth_method must be one of ${TOKEN_ENDPOINT_AUTH_METHODS.join(", ")}`,
      ),
    };
  const grants = m.grant_types ?? ["authorization_code", "refresh_token"];
  if (
    !Array.isArray(grants) ||
    !grants.every((g) => typeof g === "string") ||
    !grants.includes("authorization_code") ||
    grants.some((g) => !SUPPORTED_GRANTS.has(g))
  )
    return {
      ok: false,
      ...oauthError(
        "invalid_client_metadata",
        "grant_types must include authorization_code and may add refresh_token",
      ),
    };
  const responses = m.response_types ?? ["code"];
  if (!Array.isArray(responses) || responses.some((r) => r !== "code"))
    return {
      ok: false,
      ...oauthError("invalid_client_metadata", 'response_types must be ["code"]'),
    };
  const name = m.client_name;
  if (
    name !== undefined &&
    (typeof name !== "string" || name.trim().length > OAUTH_CLIENT_NAME_MAX)
  )
    return {
      ok: false,
      ...oauthError(
        "invalid_client_metadata",
        `client_name: up to ${OAUTH_CLIENT_NAME_MAX} characters`,
      ),
    };
  const clientUri =
    typeof m.client_uri === "string" && redirectUriProblem(m.client_uri) === null
      ? m.client_uri
      : null;
  return {
    ok: true,
    value: {
      clientName: (typeof name === "string" && name.trim()) || "MCP client",
      redirectUris: [...new Set(uris as string[])],
      tokenEndpointAuthMethod: method as TokenEndpointAuthMethod,
      grantTypes: grants,
      responseTypes: ["code"],
      clientUri,
      scope: typeof m.scope === "string" ? m.scope.slice(0, 200) : null,
    },
  };
}

// ---- the resource (RFC 8707) ---------------------------------------------------------------

/** The MCP server's canonical URI: `<app>/api/mcp`, no trailing slash. */
export function mcpResource(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/mcp`;
}

/** Scheme and host compared case-insensitively, a trailing slash ignored, nothing else. */
export function resourceMatches(requested: string, ours: string): boolean {
  const a = parseUrl(requested);
  const b = parseUrl(ours);
  if (!a || !b || a.hash || requested.includes("#")) return false;
  const path = (u: URL) => u.pathname.replace(/\/+$/, "");
  return a.origin === b.origin && path(a) === path(b) && a.search === b.search;
}

// ---- the authorization request ------------------------------------------------------------

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  resource: string;
}

export type AuthorizationRequestCheck =
  /** Unknown client or unregistered redirect: show the error, never redirect (OAuth 2.1 §4.1.2.1). */
  | { kind: "fatal"; error: OAuthErrorCode; description: string }
  /** The redirect is trusted: send the error back to the client. */
  | {
      kind: "redirect_error";
      redirectUri: string;
      state: string | null;
      error: OAuthErrorCode;
      description: string;
    }
  | { kind: "ok"; request: AuthorizationRequest };

/**
 * Check an authorization request against the registered client. `state` is echoed when sent;
 * it is optional because PKCE carries the CSRF protection in OAuth 2.1 and some MCP clients
 * omit it.
 */
export function checkAuthorizationRequest(
  params: Readonly<Record<string, string | undefined>>,
  client: { redirectUris: readonly string[] } | null,
  ourResource: string,
): AuthorizationRequestCheck {
  if (!params.client_id || !client)
    return { kind: "fatal", error: "invalid_client", description: "Unknown client_id" };
  const redirectUri = params.redirect_uri;
  if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri))
    return {
      kind: "fatal",
      error: "invalid_request",
      description: "redirect_uri does not match a registered redirect URI",
    };
  const state = params.state ?? null;
  const fail = (error: OAuthErrorCode, description: string): AuthorizationRequestCheck => ({
    kind: "redirect_error",
    redirectUri,
    state,
    error,
    description,
  });
  if (params.response_type !== "code")
    return fail("unsupported_response_type", "response_type must be code");
  if (!isCodeChallenge(params.code_challenge))
    return fail("invalid_request", "code_challenge is required (PKCE)");
  if (params.code_challenge_method !== "S256")
    return fail("invalid_request", "code_challenge_method must be S256");
  if (params.resource !== undefined && !resourceMatches(params.resource, ourResource))
    return fail("invalid_target", "resource must be this MCP server");
  return {
    kind: "ok",
    request: {
      clientId: params.client_id,
      redirectUri,
      codeChallenge: params.code_challenge,
      state,
      scope: OAUTH_SCOPE,
      resource: ourResource,
    },
  };
}

/** The redirect back to the client, with `iss` (RFC 9207) and `state` when one was sent. */
export function authorizationRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// ---- codes and refresh tokens --------------------------------------------------------------

export interface StoredCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  expiresAt: string;
  /** Set by the atomic consume; a code seen with it set before this presentation is a replay. */
  usedAt: string | null;
}

/**
 * Decide on a code that this presentation has just consumed (`firstUse`), or found already
 * consumed. A replay is reported so the caller revokes everything the code issued
 * (OAuth 2.1 §4.1.3).
 */
export function checkAuthorizationCode(
  code: StoredCode,
  input: {
    firstUse: boolean;
    clientId: string;
    redirectUri: string | undefined;
    verifier: string | undefined;
    resource: string | undefined;
    now: string;
  },
  sha256Hex: (s: string) => string,
): { ok: true } | ({ ok: false; replay: boolean } & OAuthError) {
  const no = (description: string, replay = false) => ({
    ok: false as const,
    replay,
    ...oauthError("invalid_grant", description),
  });
  if (!input.firstUse) return no("Authorization code already used", true);
  if (Date.parse(code.expiresAt) <= Date.parse(input.now)) return no("Authorization code expired");
  if (code.clientId !== input.clientId)
    return no("Authorization code was issued to another client");
  if (code.redirectUri !== input.redirectUri) return no("redirect_uri does not match");
  if (input.resource !== undefined && !resourceMatches(input.resource, code.resource))
    return no("resource does not match the authorization request");
  if (!verifyPkce(input.verifier, code.codeChallenge, sha256Hex))
    return no("code_verifier does not match the code_challenge");
  return { ok: true };
}

export interface StoredRefreshToken {
  clientId: string;
  resource: string;
  expiresAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

/**
 * Decide on a refresh token. Rotation is one-time: presenting a token that was already
 * rotated is a theft signal and revokes the connection (OAuth 2.1 §4.3.1).
 */
export function checkRefreshToken(
  token: StoredRefreshToken,
  input: { clientId: string; resource: string | undefined; now: string },
): { ok: true } | ({ ok: false; reuse: boolean } & OAuthError) {
  const no = (description: string, reuse = false) => ({
    ok: false as const,
    reuse,
    ...oauthError("invalid_grant", description),
  });
  if (token.revokedAt) return no("Refresh token revoked");
  if (token.rotatedAt) return no("Refresh token already used", true);
  if (Date.parse(token.expiresAt) <= Date.parse(input.now)) return no("Refresh token expired");
  if (token.clientId !== input.clientId) return no("Refresh token was issued to another client");
  if (input.resource !== undefined && !resourceMatches(input.resource, token.resource))
    return no("resource does not match");
  return { ok: true };
}

/** Prefixed random secrets from the crypto port's URL-safe random strings. */
export const oauthSecret = {
  code: (random: string) => `${OAUTH_CODE_PREFIX}${random}`,
  access: (random: string) => `${OAUTH_ACCESS_TOKEN_PREFIX}${random}`,
  refresh: (random: string) => `${OAUTH_REFRESH_TOKEN_PREFIX}${random}`,
  clientId: (random: string) => `${OAUTH_CLIENT_ID_PREFIX}${random}`,
};

export function isOAuthAccessToken(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith(OAUTH_ACCESS_TOKEN_PREFIX);
}
