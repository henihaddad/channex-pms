import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { pickOption } from "./ui";

/**
 * The AI layer (spec 04 §4.7a/b): a host creates API keys on Settings → API & AI, calls the
 * public API with one, then drives the MCP server as Claude would: initialize, list the tools,
 * read and write. A read-only key is refused on a write, by REST and by MCP; a revoked key is a
 * 401; and the activity log reads "via API key ‘Claude’".
 */
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function createKey(page: Page, name: string, access: string): Promise<string> {
  await page.goto("/settings/api");
  await page.getByLabel("Key name").fill(name);
  await pickOption(page, { label: "Access" }, { value: access });
  await page.getByRole("button", { name: "Create key" }).click();
  const secret = page.getByTestId("api-key-secret");
  await expect(secret).toBeVisible();
  const value = (await secret.textContent())!.trim();
  expect(value).toMatch(/^otab_[A-Za-z0-9_-]{32,}$/);
  // the connect snippets are filled with the new key
  await expect(page.getByTestId("connect-claude-code")).toContainText(
    `--header "Authorization: Bearer ${value}"`,
  );
  await expect(page.getByTestId("connect-claude-ai")).toContainText(`/api/mcp/${value}`);
  return value;
}

interface RpcReply {
  result: {
    serverInfo?: { name: string };
    tools?: Array<{ name: string }>;
    isError?: boolean;
    content: Array<{ text: string }>;
  };
}
let rpcId = 0;
async function mcp(
  request: APIRequestContext,
  key: string | null,
  method: string,
  params: Record<string, unknown> = {},
  path = "/api/mcp",
) {
  const res = await request.post(path, {
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  return { status: res.status(), body: (await res.json()) as RpcReply };
}
const callTool = async (
  request: APIRequestContext,
  key: string,
  name: string,
  args: Record<string, unknown>,
  path?: string,
) => {
  const r = await mcp(request, key, "tools/call", { name, arguments: args }, path);
  expect(r.status).toBe(200);
  const result = r.body.result;
  return { isError: result.isError === true, text: result.content[0]!.text };
};

test("API keys, the public API and the MCP server, permission-checked and audited", async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Email").fill(`ana-ai-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Claude Stays");
  await page.getByLabel("URL slug").fill(`claude-${stamp}`);
  await page.getByLabel("Country", { exact: true }).selectOption("PT");
  await page.getByLabel("Currency", { exact: true }).selectOption("EUR");
  await page.getByRole("button", { name: "Start free" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  // Settings → API & AI is in the settings nav, and warns that the URL form is a secret
  await page.goto("/settings/organization");
  await page.getByRole("link", { name: "API & AI" }).click();
  await expect(page).toHaveURL(/\/settings\/api$/);
  await expect(page.getByText(/contains your key/)).toBeVisible();

  const full = await createKey(page, "Claude", "full");
  const reader = await createKey(page, "Reader", "read_only");
  const keys = page.getByTestId("api-keys");
  await expect(keys).toContainText("Claude");
  await expect(keys).toContainText("Read only");
  await expect(keys).toContainText(full.slice(0, 12));
  await expect(keys).not.toContainText(full);

  // ---- REST with the full key: no cookie, no org header -------------------------------
  const auth = (k: string) => ({ authorization: `Bearer ${k}` });
  const created = await request.post("/api/v1/properties", {
    headers: auth(full),
    data: {
      title: "Alfama Loft",
      kind: "single_unit",
      currency: "EUR",
      timezone: "Europe/Lisbon",
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const propertyId = ((await created.json()) as { id: string }).id;
  const orgId = (await page.context().cookies()).find((c) => c.name === "pms_org")!.value;
  const drain = () => request.post("/api/v1/test/drain", { data: { orgId } });
  await drain(); // provisions the property on the fake channel manager
  const inventory = (await (
    await request.get("/api/v1/properties/inventory", { headers: auth(full) })
  ).json()) as Array<{
    id: string;
    roomTypes: Array<{ id: string; ratePlans: Array<{ id: string }> }>;
  }>;
  const roomTypeId = inventory.find((p) => p.id === propertyId)!.roomTypes[0]!.id;
  const ratePlanId = inventory.find((p) => p.id === propertyId)!.roomTypes[0]!.ratePlans[0]!.id;
  const today = await request.get("/api/v1/today", { headers: auth(full) });
  expect(today.status()).toBe(200);
  expect(await today.json()).toHaveProperty("needsYou");
  const convos = await request.get("/api/v1/conversations?filter=all", { headers: auth(full) });
  expect(convos.status()).toBe(200);

  // ---- MCP: initialize, list, write, read ---------------------------------------------
  const init = await mcp(request, full, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
  });
  expect(init.status).toBe(200);
  expect(init.body.result.serverInfo?.name).toBe("otabridge");
  const listed = await mcp(request, full, "tools/list");
  const names = (listed.body.result.tools ?? []).map((t) => t.name);
  for (const n of ["get_today", "set_prices", "get_calendar", "send_message", "cancel_reservation"])
    expect(names).toContain(n);
  expect(names).toHaveLength(18);

  const firstNight = isoIn(40);
  const lastNight = isoIn(42);
  const set = await callTool(request, full, "set_prices", {
    propertyId,
    firstNight,
    lastNight,
    priceMinor: 15500,
  });
  expect(set.isError, set.text).toBe(false);
  expect(JSON.parse(set.text)).toMatchObject({
    applied: true,
    cells: 3,
    ratePlanIds: [ratePlanId],
  });
  const cal = await callTool(request, full, "get_calendar", { propertyId, firstNight, lastNight });
  expect(cal.isError, cal.text).toBe(false);
  const nights = (
    JSON.parse(cal.text) as {
      properties: Array<{
        roomTypes: Array<{
          ratePlans: Array<{ nights: Array<{ date: string; priceMinor: number }> }>;
        }>;
      }>;
    }
  ).properties[0]!.roomTypes[0]!.ratePlans[0]!.nights;
  expect(nights.map((n) => n.date)).toEqual([firstNight, isoIn(41), lastNight]);
  for (const n of nights) expect(n.priceMinor).toBe(15500);
  const closed = await callTool(request, full, "set_availability", {
    propertyId,
    firstNight: lastNight,
    lastNight,
    open: false,
  });
  expect(closed.isError, closed.text).toBe(false);

  // ---- a direct booking, the guest writes, Claude answers through the channel ---------
  const booked = await callTool(request, full, "create_reservation", {
    propertyId,
    roomTypeId,
    ratePlanId,
    arrivalDate: isoIn(2),
    departureDate: isoIn(4),
    adults: 2,
    guestName: "Rui Costa",
    email: `rui-${stamp}@example.com`,
  });
  expect(booked.isError, booked.text).toBe(false);
  const { reservationId } = JSON.parse(booked.text) as { reservationId: string };
  const found = await callTool(request, full, "list_reservations", { q: "Rui Costa" });
  expect(JSON.parse(found.text).reservations[0]).toMatchObject({
    id: reservationId,
    guest: "Rui Costa",
    nights: 2,
  });
  await drain();
  const emitted = await request.post("/api/v1/test/message", {
    data: {
      propertyId,
      localBookingId: reservationId,
      body: "Is there parking?",
      guestName: "Rui Costa",
    },
  });
  expect(emitted.status()).toBe(201);
  await drain();
  const waiting = await callTool(request, full, "list_conversations", { filter: "needs_reply" });
  const convo = (
    JSON.parse(waiting.text) as {
      conversations: Array<{ id: string; guest: string; propertyId: string }>;
    }
  ).conversations.find((c) => c.guest === "Rui Costa")!;
  expect(convo.propertyId).toBe(propertyId);
  const thread = await callTool(request, full, "read_conversation", { conversationId: convo.id });
  expect(thread.text).toContain("Is there parking?");
  const sent = await callTool(request, full, "send_message", {
    conversationId: convo.id,
    propertyId,
    text: "Yes: free parking in front of the building.",
  });
  expect(sent.isError, sent.text).toBe(false);
  const note = await callTool(request, full, "add_note", {
    conversationId: convo.id,
    propertyId,
    text: "Asked about parking (via Claude).",
  });
  expect(note.isError, note.text).toBe(false);
  await drain();
  const ledger = (await (await request.get("/api/v1/test/message")).json()) as {
    sent: Array<{ body: string }>;
  };
  expect(ledger.sent.some((m) => m.body === "Yes: free parking in front of the building.")).toBe(
    true,
  );
  expect(ledger.sent.some((m) => m.body.includes("via Claude"))).toBe(false);
  const cancelled = await callTool(request, full, "cancel_reservation", {
    reservationId,
    propertyId,
  });
  expect(cancelled.isError, cancelled.text).toBe(false);
  const detail = await request.get(`/api/v1/reservations/${reservationId}`, {
    headers: auth(full),
  });
  expect(((await detail.json()) as { status: string }).status).toBe("cancelled");

  // ---- a read-only key reads, and is refused on every write ----------------------------
  const roCal = await callTool(request, reader, "get_calendar", {
    propertyId,
    firstNight,
    lastNight,
  });
  expect(roCal.isError, roCal.text).toBe(false);
  const refused = await callTool(request, reader, "set_prices", {
    propertyId,
    firstNight,
    lastNight,
    priceMinor: 1,
  });
  expect(refused.isError).toBe(true);
  expect(refused.text).toContain("ari:update_rate");
  expect(refused.text).toContain("Read only");
  const rest403 = await request.put("/api/v1/ari/prices", {
    headers: auth(reader),
    data: { propertyId, firstNight, lastNight, priceMinor: 1 },
  });
  expect(rest403.status()).toBe(403);
  expect(((await rest403.json()) as { missing: string }).missing).toBe("ari:update_rate");
  // the price did not move
  const after = await request.get(
    `/api/v1/ari/calendar?propertyId=${propertyId}&firstNight=${firstNight}&lastNight=${firstNight}`,
    { headers: auth(reader) },
  );
  expect(JSON.stringify(await after.json())).toContain('"priceMinor":15500');

  // ---- the key in the path, for clients that cannot send a header --------------------
  const viaPath = await callTool(request, reader, "get_today", {}, `/api/mcp/${reader}`);
  expect(viaPath.isError, viaPath.text).toBe(false);

  // ---- unknown keys are 401 problems ---------------------------------------------------
  const bogus = `otab_${"x".repeat(40)}`;
  const r401 = await request.get("/api/v1/today", { headers: auth(bogus) });
  expect(r401.status()).toBe(401);
  expect(((await r401.json()) as { code: string }).code).toBe("invalid_api_key");
  expect((await mcp(request, bogus, "tools/list")).status).toBe(401);
  expect((await mcp(request, null, "tools/list")).status).toBe(401);

  // ---- revoke: the next request is a 401 -----------------------------------------------
  await page.goto("/settings/api");
  await page
    .getByTestId("api-keys")
    .locator("tr", { hasText: "Reader" })
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(
    page.getByTestId("api-keys").locator("tr", { hasText: "Reader" }).getByText("Revoked"),
  ).toBeVisible();
  expect((await request.get("/api/v1/today", { headers: auth(reader) })).status()).toBe(401);
  expect((await mcp(request, reader, "tools/list")).status).toBe(401);

  // ---- the activity log names the key, and the chain still verifies --------------------
  await page.goto("/settings/audit");
  await expect(page.getByText(/chain intact/)).toBeVisible();
  await expect(page.getByText("via API key ‘Claude’").first()).toBeVisible();
  await expect(page.locator("code", { hasText: "ari:update_rate" }).first()).toBeVisible();
});
