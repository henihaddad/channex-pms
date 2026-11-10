import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  authorizationRedirect,
  checkAuthorizationCode,
  checkAuthorizationRequest,
  checkRefreshToken,
  connectionName,
  constantTimeEqual,
  hexToBase64Url,
  isCodeChallenge,
  isCodeVerifier,
  isOAuthAccessToken,
  mcpResource,
  oauthSecret,
  pkceChallenge,
  redirectUriMatches,
  redirectUriProblem,
  resourceMatches,
  validateClientMetadata,
  verifyPkce,
  type StoredCode,
  type StoredRefreshToken,
} from "./oauth.js";
import { isApiKey } from "./api-key.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const verifierArb = fc.stringMatching(/^[A-Za-z0-9\-._~]{43,128}$/);
const RESOURCE = "https://app.otabridge.com/api/mcp";

describe("PKCE (RFC 7636 S256)", () => {
  it("matches the RFC 7636 appendix B example", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(pkceChallenge(verifier, sha)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("base64url agrees with Node's encoder for any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        const hex = Buffer.from(bytes).toString("hex");
        expect(hexToBase64Url(hex)).toBe(Buffer.from(bytes).toString("base64url"));
      }),
    );
  });

  it("a verifier always satisfies its own challenge, and never another's", () => {
    fc.assert(
      fc.property(verifierArb, verifierArb, (v, other) => {
        const challenge = pkceChallenge(v, sha);
        expect(isCodeChallenge(challenge)).toBe(true);
        expect(verifyPkce(v, challenge, sha)).toBe(true);
        if (other !== v) expect(verifyPkce(other, challenge, sha)).toBe(false);
      }),
    );
  });

  it("refuses verifiers outside 43..128 unreserved characters", () => {
    expect(isCodeVerifier("a".repeat(42))).toBe(false);
    expect(isCodeVerifier("a".repeat(129))).toBe(false);
    expect(isCodeVerifier(`${"a".repeat(42)}!`)).toBe(false);
    expect(isCodeVerifier(undefined)).toBe(false);
    expect(verifyPkce(undefined, pkceChallenge("a".repeat(43), sha), sha)).toBe(false);
  });

  it("compares in constant shape", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(constantTimeEqual(a, b)).toBe(a === b);
      }),
    );
  });
});

describe("redirect URIs", () => {
  it("accepts https and loopback http, nothing else", () => {
    expect(redirectUriProblem("https://claude.ai/api/mcp/auth_callback")).toBeNull();
    expect(redirectUriProblem("https://claude.com/api/mcp/auth_callback")).toBeNull();
    expect(redirectUriProblem("http://127.0.0.1:9999/callback")).toBeNull();
    expect(redirectUriProblem("http://localhost:33418/callback")).toBeNull();
    expect(redirectUriProblem("http://[::1]:8080/cb")).toBeNull();
    expect(redirectUriProblem("http://example.com/cb")).not.toBeNull();
    expect(redirectUriProblem("http://localhost.evil.com/cb")).not.toBeNull();
    expect(redirectUriProblem("https://claude.ai/cb#x")).not.toBeNull();
    expect(redirectUriProblem("https://user:pw@claude.ai/cb")).not.toBeNull();
    expect(redirectUriProblem("javascript:alert(1)")).not.toBeNull();
    expect(redirectUriProblem("myapp://callback")).not.toBeNull();
    expect(redirectUriProblem("")).not.toBeNull();
  });

  it("any plain-http non-loopback host is refused", () => {
    fc.assert(
      fc.property(fc.domain(), (host) => {
        fc.pre(host !== "localhost");
        expect(redirectUriProblem(`http://${host}/cb`)).not.toBeNull();
        expect(redirectUriProblem(`https://${host}/cb`)).toBeNull();
      }),
    );
  });

  it("matches exactly, except a loopback port", () => {
    const reg = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:9999/callback"];
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback/")).toBe(false);
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
    expect(redirectUriMatches(reg, "https://claude.ai.evil.com/api/mcp/auth_callback")).toBe(false);
    expect(redirectUriMatches(reg, "http://127.0.0.1:51234/callback")).toBe(true);
    expect(redirectUriMatches(reg, "http://127.0.0.1:51234/other")).toBe(false);
    expect(redirectUriMatches(reg, "http://localhost:9999/callback")).toBe(false);
  });

  it("names the connection after the client and the redirect host", () => {
    expect(connectionName("Claude", "https://claude.ai/api/mcp/auth_callback")).toBe(
      "Claude (claude.ai)",
    );
    expect(connectionName("Claude Code", "http://127.0.0.1:3118/callback")).toBe(
      "Claude Code (localhost)",
    );
    expect(connectionName("  ", "https://www.example.com/cb")).toBe("MCP client (example.com)");
  });
});

describe("client registration (RFC 7591)", () => {
  it("accepts what claude.ai sends", () => {
    const r = validateClientMetadata({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "claudeai",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.clientName).toBe("Claude");
      expect(r.value.tokenEndpointAuthMethod).toBe("none");
    }
  });

  it("defaults to a public client with both grants", () => {
    const r = validateClientMetadata({ redirect_uris: ["http://localhost:1234/cb"] });
    expect(r).toMatchObject({
      ok: true,
      value: {
        clientName: "MCP client",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
      },
    });
  });

  it("refuses bad redirects, unknown auth methods, implicit grants, too many URIs", () => {
    expect(validateClientMetadata({})).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(validateClientMetadata({ redirect_uris: ["http://evil.com/cb"] })).toMatchObject({
      ok: false,
      error: "invalid_redirect_uri",
    });
    expect(
      validateClientMetadata({
        redirect_uris: ["https://a.com/cb"],
        token_endpoint_auth_method: "private_key_jwt",
      }),
    ).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(
      validateClientMetadata({ redirect_uris: ["https://a.com/cb"], grant_types: ["implicit"] }),
    ).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(
      validateClientMetadata({
        redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.com/${i}`),
      }),
    ).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(validateClientMetadata([])).toMatchObject({ ok: false });
  });
});

describe("resource (RFC 8707)", () => {
  it("is the MCP endpoint, compared on origin and path", () => {
    expect(mcpResource("https://app.otabridge.com/")).toBe(RESOURCE);
    expect(resourceMatches(RESOURCE, RESOURCE)).toBe(true);
    expect(resourceMatches(`${RESOURCE}/`, RESOURCE)).toBe(true);
    expect(resourceMatches("HTTPS://APP.OTABRIDGE.COM/api/mcp", RESOURCE)).toBe(true);
    expect(resourceMatches("https://app.otabridge.com", RESOURCE)).toBe(false);
    expect(resourceMatches("https://evil.com/api/mcp", RESOURCE)).toBe(false);
    expect(resourceMatches(`${RESOURCE}#x`, RESOURCE)).toBe(false);
    expect(resourceMatches("not a url", RESOURCE)).toBe(false);
  });
});

describe("the authorization request", () => {
  const client = { redirectUris: ["https://claude.ai/api/mcp/auth_callback"] };
  const challenge = pkceChallenge("v".repeat(43), sha);
  const good = {
    response_type: "code",
    client_id: "c1",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: RESOURCE,
  };

  it("passes a well-formed request", () => {
    expect(checkAuthorizationRequest(good, client, RESOURCE)).toMatchObject({
      kind: "ok",
      request: { clientId: "c1", state: "xyz", resource: RESOURCE, codeChallenge: challenge },
    });
  });

  it("never redirects for an unknown client or an unregistered redirect", () => {
    expect(checkAuthorizationRequest(good, null, RESOURCE).kind).toBe("fatal");
    expect(
      checkAuthorizationRequest({ ...good, redirect_uri: "https://evil.com/cb" }, client, RESOURCE)
        .kind,
    ).toBe("fatal");
  });

  it("sends protocol errors back to the client with its state", () => {
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ code_challenge: undefined }, "invalid_request"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ resource: "https://evil.com/api/mcp" }, "invalid_target"],
    ];
    for (const [patch, error] of cases)
      expect(checkAuthorizationRequest({ ...good, ...patch }, client, RESOURCE)).toMatchObject({
        kind: "redirect_error",
        error,
        state: "xyz",
      });
  });

  it("builds the redirect with code, state and iss", () => {
    const u = new URL(
      authorizationRedirect("https://claude.ai/api/mcp/auth_callback", {
        code: "abc",
        state: "x y",
        iss: "https://app.otabridge.com",
        skipped: null,
      }),
    );
    expect(u.searchParams.get("code")).toBe("abc");
    expect(u.searchParams.get("state")).toBe("x y");
    expect(u.searchParams.has("skipped")).toBe(false);
  });
});

describe("authorization code lifecycle", () => {
  const verifier = "a".repeat(64);
  const code: StoredCode = {
    clientId: "c1",
    redirectUri: "http://127.0.0.1:9999/callback",
    codeChallenge: pkceChallenge(verifier, sha),
    resource: RESOURCE,
    expiresAt: "2026-11-10T10:05:00Z",
    usedAt: "2026-11-10T10:01:00Z",
  };
  const input = {
    firstUse: true,
    clientId: "c1",
    redirectUri: "http://127.0.0.1:9999/callback",
    verifier,
    resource: RESOURCE,
    now: "2026-11-10T10:01:00Z",
  };

  it("exchanges once", () => {
    expect(checkAuthorizationCode(code, input, sha)).toEqual({ ok: true });
  });

  it("a second presentation is a replay", () => {
    expect(checkAuthorizationCode(code, { ...input, firstUse: false }, sha)).toMatchObject({
      ok: false,
      error: "invalid_grant",
      replay: true,
    });
  });

  it("refuses an expired code, another client, another redirect, another resource, a wrong verifier", () => {
    for (const patch of [
      { now: "2026-11-10T10:05:00Z" },
      { clientId: "c2" },
      { redirectUri: "http://127.0.0.1:9999/other" },
      { redirectUri: undefined },
      { resource: "https://evil.com/api/mcp" },
      { verifier: "b".repeat(64) },
      { verifier: undefined },
    ])
      expect(checkAuthorizationCode(code, { ...input, ...patch }, sha)).toMatchObject({
        ok: false,
        error: "invalid_grant",
        replay: false,
      });
  });

  it("any verifier but the right one fails", () => {
    fc.assert(
      fc.property(verifierArb, (v) => {
        fc.pre(v !== verifier);
        expect(checkAuthorizationCode(code, { ...input, verifier: v }, sha).ok).toBe(false);
      }),
    );
  });
});

describe("refresh token lifecycle", () => {
  const token: StoredRefreshToken = {
    clientId: "c1",
    resource: RESOURCE,
    expiresAt: "2027-01-01T00:00:00Z",
    rotatedAt: null,
    revokedAt: null,
  };
  const input = { clientId: "c1", resource: undefined, now: "2026-11-10T10:00:00Z" };

  it("rotates a live token", () => {
    expect(checkRefreshToken(token, input)).toEqual({ ok: true });
  });
  it("a rotated token presented again is reuse", () => {
    expect(checkRefreshToken({ ...token, rotatedAt: "2026-11-10T09:00:00Z" }, input)).toMatchObject(
      { ok: false, reuse: true, error: "invalid_grant" },
    );
  });
  it("revoked, expired, another client: invalid_grant without the reuse signal", () => {
    for (const [t, i] of [
      [{ ...token, revokedAt: "2026-11-10T09:00:00Z" }, input],
      [{ ...token, expiresAt: "2026-11-10T10:00:00Z" }, input],
      [token, { ...input, clientId: "c2" }],
      [token, { ...input, resource: "https://evil.com/api/mcp" }],
    ] as const)
      expect(checkRefreshToken(t, i)).toMatchObject({ ok: false, reuse: false });
  });
});

describe("token shapes", () => {
  it("an access token is an API key the resolver accepts, told apart by its prefix", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9_-]{40}$/), (r) => {
        const t = oauthSecret.access(r);
        expect(t.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)).toBe(true);
        expect(isApiKey(t)).toBe(true);
        expect(isOAuthAccessToken(t)).toBe(true);
        expect(isOAuthAccessToken(`otab_${r}`)).toBe(r.startsWith("oat_"));
      }),
    );
  });
});
