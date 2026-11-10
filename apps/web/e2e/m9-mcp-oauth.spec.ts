import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { pickOption } from "./ui";

/**
 * "Sign in with OTAbridge" (spec 04 §4.7b), walked as an MCP client walks it: discover the
 * protected resource and the authorization server, register, send the host to the consent
 * screen (signing in on the way), approve, catch the code on the loopback redirect, exchange
 * it with PKCE, call the MCP server, refresh, and lose access the moment the host disconnects.
 * A wrong verifier, a reused code and a reused refresh token are each an invalid_grant.
 */
const REDIRECT = "http://127.0.0.1:9999/callback";
const PASSWORD = "correct horse battery staple";
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
/** The issuer is NEXT_PUBLIC_APP_URL, which need not be the address this test server listens on. */
const path = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};
const b64url = (b: Buffer) => b.toString("base64url");

interface Tokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

let rpcId = 0;
async function mcp(
  request: APIRequestContext,
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
  at = "/api/mcp",
) {
  const res = await request.post(at, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  return res;
}
async function callTool(
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown>,
) {
  const res = await mcp(request, token, "tools/call", { name, arguments: args });
  expect(res.status(), await res.text()).toBe(200);
  const result = (
    (await res.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    }
  ).result;
  return { isError: result.isError === true, text: result.content[0]!.text };
}

test("an MCP client connects by OAuth: discover, register, consent, PKCE, refresh, disconnect", async ({
  page,
  request,
  browser,
}) => {
  const stamp = Date.now().toString(36);
  const email = `ana-oauth-${stamp}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Organization name").fill("Signed In Stays");
  await page.getByLabel("URL slug").fill(`oauth-${stamp}`);
  await page.getByLabel("Country", { exact: true }).selectOption("PT");
  await page.getByLabel("Currency", { exact: true }).selectOption("EUR");
  await page.getByRole("button", { name: "Start free" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  // ---- discovery: 401 with a pointer to the resource metadata, then the AS metadata --------
  const unauth = await mcp(request, null, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
  });
  expect(unauth.status()).toBe(401);
  expect(((await unauth.json()) as { code: string }).code).toBe("invalid_api_key");
  const challenge = unauth.headers()["www-authenticate"]!;
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  expect(metadataUrl).toMatch(/\/\.well-known\/oauth-protected-resource\/api\/mcp$/);

  const prmRes = await request.get(path(metadataUrl!));
  expect(prmRes.status()).toBe(200);
  expect(prmRes.headers()["access-control-allow-origin"]).toBe("*");
  const prm = OAuthProtectedResourceMetadataSchema.parse(await prmRes.json());
  expect(prm.resource).toMatch(/\/api\/mcp$/);
  expect(prm.bearer_methods_supported).toEqual(["header"]);
  expect(prm.scopes_supported).toContain("mcp");
  const root = await request.get("/.well-known/oauth-protected-resource");
  expect(await root.json()).toEqual(prm);

  const issuer = prm.authorization_servers![0]!;
  const as = OAuthMetadataSchema.parse(
    await (await request.get("/.well-known/oauth-authorization-server")).json(),
  );
  expect(as.issuer).toBe(issuer);
  expect(as.response_types_supported).toEqual(["code"]);
  expect(as.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  expect(as.token_endpoint_auth_methods_supported).toContain("none");
  expect(as.registration_endpoint).toBeDefined();
  expect(as.revocation_endpoint).toBeDefined();

  // ---- dynamic client registration -----------------------------------------------------------
  const refused = await request.post(path(as.registration_endpoint!), {
    data: { client_name: "Evil", redirect_uris: ["http://evil.example.com/cb"] },
  });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { error: string }).error).toBe("invalid_redirect_uri");
  const reg = await request.post(path(as.registration_endpoint!), {
    data: {
      client_name: "E2E Claude",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const client = (await reg.json()) as { client_id: string; redirect_uris: string[] };
  expect(client.client_id).toMatch(/^otab_client_/);
  expect(client.redirect_uris).toEqual([REDIRECT]);

  // ---- the authorization request, approved (or denied) in a browser ----------------------------
  const authorizeUrl = (challengeValue: string, state: string) =>
    `${path(as.authorization_endpoint)}?${new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challengeValue,
      code_challenge_method: "S256",
      state,
      scope: "mcp",
      resource: prm.resource,
    }).toString()}`;
  const pkce = () => {
    const verifier = b64url(randomBytes(48));
    return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
  };
  /** Open the consent screen, pick a level, approve (or deny), and catch the loopback redirect. */
  async function consent(
    on: Page,
    level: RegExp | null,
    opts: { signIn?: boolean } = {},
  ): Promise<{ code: string | null; params: URLSearchParams; verifier: string; state: string }> {
    const { verifier, challenge: c } = pkce();
    const state = b64url(randomBytes(12));
    let caught: string | null = null;
    await on.route("http://127.0.0.1:9999/**", async (route) => {
      caught = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "You can close this tab.",
      });
    });
    await on.goto(authorizeUrl(c, state));
    if (opts.signIn) {
      await expect(on).toHaveURL(/\/login\?next=%2Foauth%2Fauthorize/);
      await on.getByLabel("Email").fill(email);
      await on.getByLabel("Password").fill(PASSWORD);
      await on.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await expect(
      on.getByRole("heading", { name: "Connect E2E Claude to OTAbridge" }),
    ).toBeVisible();
    await expect(on.getByText("Signed In Stays")).toBeVisible();
    if (level) {
      await on.getByRole("radio", { name: level }).check();
      await on.getByRole("button", { name: "Approve" }).click();
    } else await on.getByRole("link", { name: "Deny" }).click();
    await expect.poll(() => caught).not.toBeNull();
    await on.unroute("http://127.0.0.1:9999/**");
    const params = new URL(caught!).searchParams;
    expect(params.get("state")).toBe(state);
    expect(params.get("iss")).toBe(issuer);
    return { code: params.get("code"), params, verifier, state };
  }
  const token = (form: Record<string, string>) =>
    request.post(path(as.token_endpoint), { form: { client_id: client.client_id, ...form } });
  const exchange = (code: string, verifier: string) =>
    token({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: prm.resource,
    });
  const errorOf = async (res: Awaited<ReturnType<typeof token>>) => {
    expect(res.status()).toBe(400);
    return ((await res.json()) as { error: string }).error;
  };

  // signed out: the consent screen sends the host to sign in and brings them back
  const fresh = await browser.newContext();
  const signInPage = await fresh.newPage();
  const a = await consent(signInPage, /Read only/, { signIn: true });
  await fresh.close();
  expect(a.code).toMatch(/^otab_oac_/);

  // ---- the code for tokens, with the PKCE verifier ----------------------------------------------
  const exchanged = await exchange(a.code!, a.verifier);
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  expect(exchanged.headers()["cache-control"]).toBe("no-store");
  const t1 = (await exchanged.json()) as Tokens;
  expect(t1).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp" });
  expect(t1.access_token).toMatch(/^otab_oat_/);
  expect(t1.refresh_token).toMatch(/^otab_ort_/);

  // ---- the MCP server with the access token: reads work, writes are refused --------------------
  const init = await mcp(request, t1.access_token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
  });
  expect(init.status()).toBe(200);
  const listed = (await (await mcp(request, t1.access_token, "tools/list")).json()) as {
    result: { tools: Array<{ name: string }> };
  };
  expect(listed.result.tools).toHaveLength(18);
  const today = await callTool(request, t1.access_token, "get_today", {});
  expect(today.isError, today.text).toBe(false);
  expect(JSON.parse(today.text)).toHaveProperty("needsYou");
  const write = await callTool(request, t1.access_token, "set_prices", {
    propertyId: "00000000-0000-4000-8000-000000000000",
    firstNight: isoIn(30),
    lastNight: isoIn(31),
    priceMinor: 100,
  });
  expect(write.isError).toBe(true);
  expect(write.text).toContain("ari:update_rate");
  expect(write.text).toContain("Read only");
  expect(write.text).toContain("connection");
  // the token is for the MCP server only: not the REST API, never in a URL
  expect(
    (
      await request.get("/api/v1/today", {
        headers: { authorization: `Bearer ${t1.access_token}` },
      })
    ).status(),
  ).toBe(401);
  expect((await mcp(request, null, "tools/list", {}, `/api/mcp/${t1.access_token}`)).status()).toBe(
    401,
  );

  // ---- refresh rotates ----------------------------------------------------------------------------
  const refreshed = await token({ grant_type: "refresh_token", refresh_token: t1.refresh_token });
  expect(refreshed.status(), await refreshed.text()).toBe(200);
  const t2 = (await refreshed.json()) as Tokens;
  expect(t2.refresh_token).not.toBe(t1.refresh_token);
  expect(t2.access_token).not.toBe(t1.access_token);
  expect((await callTool(request, t2.access_token, "list_properties", {})).isError).toBe(false);

  // ---- Settings → API & AI lists the connection; Disconnect ends it ------------------------------
  await page.goto("/settings/api");
  await expect(page.getByTestId("connect-claude-ai-oauth")).toHaveText(/\/api\/mcp$/);
  const apps = page.getByTestId("connected-apps");
  const row = apps.locator("tr", { hasText: "E2E Claude (localhost)" });
  await expect(row).toContainText("Read only");
  await expect(page.getByTestId("api-keys")).not.toContainText("otab_oat_");
  await row.getByRole("button", { name: "Disconnect" }).click();
  await expect(apps).not.toContainText("E2E Claude (localhost)");
  expect((await mcp(request, t2.access_token, "tools/list")).status()).toBe(401);
  expect(
    await errorOf(await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token })),
  ).toBe("invalid_grant");

  // ---- Deny sends access_denied back, with the state ---------------------------------------------
  const denied = await consent(page, null);
  expect(denied.code).toBeNull();
  expect(denied.params.get("error")).toBe("access_denied");

  // ---- a wrong verifier burns the code ------------------------------------------------------------
  const b = await consent(page, /Full access/);
  expect(await errorOf(await exchange(b.code!, pkce().verifier))).toBe("invalid_grant");
  expect(await errorOf(await exchange(b.code!, b.verifier))).toBe("invalid_grant");

  // ---- full access: a write lands, is audited "via" the app; revocation; a reused code ----------
  await page.goto("/settings/api");
  await page.getByLabel("Key name").fill("Setup");
  await pickOption(page, { label: "Access" }, { value: "full" });
  await page.getByRole("button", { name: "Create key" }).click();
  const key = (await page.getByTestId("api-key-secret").textContent())!.trim();
  const created = await request.post("/api/v1/properties", {
    headers: { authorization: `Bearer ${key}` },
    data: { title: "Graça Flat", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const propertyId = ((await created.json()) as { id: string }).id;
  const orgId = (await page.context().cookies()).find((c) => c.name === "pms_org")!.value;
  await request.post("/api/v1/test/drain", { data: { orgId } });

  const c = await consent(page, /Full access/);
  const t3 = (await (await exchange(c.code!, c.verifier)).json()) as Tokens;
  const set = await callTool(request, t3.access_token, "set_prices", {
    propertyId,
    firstNight: isoIn(40),
    lastNight: isoIn(41),
    priceMinor: 14200,
  });
  expect(set.isError, set.text).toBe(false);
  await page.goto("/settings/audit");
  await expect(page.getByText(/chain intact/)).toBeVisible();
  await expect(page.getByText("via E2E Claude (localhost)").first()).toBeVisible();

  // RFC 7009: revoking the access token ends that token; the refresh token still works
  const revoked = await request.post(path(as.revocation_endpoint!), {
    form: { client_id: client.client_id, token: t3.access_token, token_type_hint: "access_token" },
  });
  expect(revoked.status()).toBe(200);
  expect((await mcp(request, t3.access_token, "tools/list")).status()).toBe(401);
  const t4 = (await (
    await token({ grant_type: "refresh_token", refresh_token: t3.refresh_token })
  ).json()) as Tokens;
  expect((await mcp(request, t4.access_token, "tools/list")).status()).toBe(200);
  // a rotated refresh token presented again is a theft signal: the connection ends
  expect(
    await errorOf(await token({ grant_type: "refresh_token", refresh_token: t3.refresh_token })),
  ).toBe("invalid_grant");
  expect((await mcp(request, t4.access_token, "tools/list")).status()).toBe(401);

  // a reused code is refused and takes back what it issued
  const d = await consent(page, /Read only/);
  const t5 = (await (await exchange(d.code!, d.verifier)).json()) as Tokens;
  expect((await mcp(request, t5.access_token, "tools/list")).status()).toBe(200);
  expect(await errorOf(await exchange(d.code!, d.verifier))).toBe("invalid_grant");
  expect((await mcp(request, t5.access_token, "tools/list")).status()).toBe(401);

  // an unknown client is refused at the token endpoint
  const stranger = await request.post(path(as.token_endpoint), {
    form: { grant_type: "authorization_code", code: "x", client_id: "otab_client_nope" },
  });
  expect(stranger.status()).toBe(401);
  expect(((await stranger.json()) as { error: string }).error).toBe("invalid_client");
});
