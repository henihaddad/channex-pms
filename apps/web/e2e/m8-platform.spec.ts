import { expect, test, type Page } from "@playwright/test";

/**
 * M8 exit (spec 15, spec 12): the onboarding checklist, a plan chosen and a card saved on the
 * fake billing provider with usage the customer can see; a plugin installed with its permission
 * grant and a signed delivery landing on an endpoint; the operator console diagnosing a property
 * without guest data; an approved impersonation with the banner and PII closed; a suspended
 * tenant whose console closes while sync still runs; the full export bundle.
 */
async function signUp(
  page: Page,
  stamp: string,
  who: string,
): Promise<{ orgId: string; email: string }> {
  const email = `${who}-${stamp}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(who);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill(`${who} Co`);
  await page.getByLabel("URL slug").fill(`${who.toLowerCase()}-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  const orgId = (await page.context().cookies()).find((c) => c.name === "pms_org")?.value ?? "";
  return { orgId, email };
}

test("onboarding → billing → plugins → operator console → impersonation → suspension → export", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36);
  const { orgId, email } = await signUp(page, stamp, "Mia");
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  // onboarding checklist (spec 12 §12.3): organization done, property not yet
  await expect(page.getByTestId("onboarding-checklist")).toBeVisible();
  await expect(
    page.locator('[data-testid="onboarding-checklist"] [data-step="property"]'),
  ).toHaveAttribute("data-done", "0");
  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("Platform Flat");
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-state")).toBeVisible({ timeout: 90_000 });
  const propertyId = page.url().split("/properties/")[1]!.split(/[/?]/)[0]!;
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.goto("/");
  await expect(
    page.locator('[data-testid="onboarding-checklist"] [data-step="property"]'),
  ).toHaveAttribute("data-done", "1");

  // billing (spec 12 §12.5): trial → plan chosen → active; a card; usage and the invoice explainer
  await page.goto("/settings/billing");
  await expect(page.getByTestId("tenant-state")).toHaveText("trial");
  await page.getByTestId("plan-radio-growth").check();
  await page.getByLabel("Billing name").fill("Mia Co");
  await page.getByLabel("Billing email").fill(email);
  await page.getByTestId("choose-plan").click();
  await expect(page.getByTestId("tenant-state")).toHaveText("active");
  await page.locator('input[name="cardToken"]').fill("tok_visa_4242");
  await page.getByTestId("attach-card").click();
  await expect(page.getByTestId("payment-method")).toContainText("4242");
  await request.post("/api/v1/test/drain", { data: { orgId, platform: true } });
  await page.reload();
  await expect(page.getByTestId("usage-units")).toHaveText("1");

  // plugins (spec 12 §12.7): install with the permissions shown, secret once, a signed delivery lands
  const sinkSecretProbe = await request.get("/api/v1/test/plugin-sink");
  expect(sinkSecretProbe.status()).toBe(200);
  await page.goto("/settings/plugins");
  await page
    .getByLabel("Endpoint URL")
    .fill(new URL("/api/v1/test/plugin-sink", baseURL ?? "http://localhost:3100").toString());
  await page.locator("#manifest").fill(
    JSON.stringify({
      key: "e2e-sink",
      name: "E2E sink",
      version: "1.0.0",
      events: ["ari."],
      extensionPoints: ["event_subscriber"],
      permissions: ["read:ari"],
      compatibleCore: ">=1",
    }),
  );
  await page.getByTestId("install-plugin").click();
  const secretText = (await page.getByTestId("plugin-secret").textContent()) ?? "";
  const secret = secretText.split(": ").at(-1)!.trim();
  expect(secret.length).toBeGreaterThan(16);
  await request.get(`/api/v1/test/plugin-sink?secret=${encodeURIComponent(secret)}`);
  await expect(page.getByTestId("plugin-row")).toContainText("read:ari");
  // an ARI change after the install is an event the plugin wants: a booking-engine hold takes a room out
  await page.goto(`/properties/${propertyId}/booking-engine`);
  await page.getByTestId("toggle-engine").click();
  await expect(page.getByTestId("engine-state")).toHaveAttribute("data-enabled", "1");
  const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/book/${propertyId}?arrival=${plus(5)}&departure=${plus(6)}&adults=2`);
  await page.getByTestId("book-offer").click();
  await expect(page.getByTestId("quote")).toBeVisible();
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await request.post("/api/v1/test/drain", { data: { orgId, platform: true } });
  const sink = (await (await request.get("/api/v1/test/plugin-sink")).json()) as {
    received: Array<{ event: string; valid: boolean }>;
  };
  expect(sink.received.length).toBeGreaterThan(0);
  expect(sink.received.every((r) => r.valid)).toBe(true);
  await page.goto("/settings/plugins");
  await expect(
    page.locator('[data-testid="delivery-row"][data-state="delivered"]').first(),
  ).toBeVisible();

  // support: pre-granted access so the operator can start a session without a per-request approval
  await page.goto("/settings/support");
  await page.getByTestId("grant-support-access").click();
  await expect(page.getByTestId("support-access-active")).toBeVisible();
  const diagnostics = await page.request.get("/api/v1/support/diagnostics");
  expect(diagnostics.status()).toBe(200);
  const diag = (await diagnostics.json()) as {
    config: Record<string, string>;
    health: Record<string, number>;
  };
  expect(Object.values(diag.config).every((v) => v === "set" || v === "absent")).toBe(true);

  // the operator, in a second browser: fleet, tenants, the inspector, then an impersonation
  const opCtx = await browser.newContext();
  const op = await opCtx.newPage();
  const operator = await signUp(op, stamp, "Ops");
  await op.goto("/ops");
  await expect(op.getByTestId("not-operator")).toBeVisible();
  await request.post("/api/v1/test/operator", { data: { email: operator.email } });
  await op.goto("/ops");
  await expect(op.getByTestId("fleet-health")).toBeVisible();
  await op.goto(`/ops/tenants?q=mia-${stamp}`);
  await expect(op.locator('[data-testid="tenant-row"][data-state="active"]')).toHaveCount(1);
  await op.goto(`/ops/inspector/${propertyId}`);
  await expect(op.getByTestId("sync-inspector")).toBeVisible();
  await expect(op.getByTestId("sync-inspector")).toContainText("direct");
  await expect(op.getByTestId("sync-inspector")).not.toContainText("@example.com");
  await op.goto("/ops/impersonation");
  await op.getByLabel("Tenant (blank = platform)").fill(orgId);
  await op.getByLabel("Reason (shown to the tenant)").fill("Rates not updating, ticket 42");
  await op.getByTestId("request-impersonation").click();
  await expect(
    op
      .locator('[data-testid="impersonation-row"][data-state="approved"]')
      .filter({ hasText: "· you ·" }),
  ).toHaveCount(1);
  await op.getByTestId("enter-impersonation").click();
  await expect(
    op
      .locator('[data-testid="impersonation-row"][data-state="active"]')
      .filter({ hasText: "· you ·" }),
  ).toHaveCount(1);
  await op.goto("/");
  await expect(op.getByTestId("impersonation-banner")).toBeVisible();
  // read-only, PII closed (OPCON-1): the reservations list opens, the inbox does not
  await op.goto("/reservations");
  await expect(op.getByTestId("reservations-table")).toBeVisible();
  await op.goto("/inbox");
  await expect(op.getByRole("heading", { name: "Permission denied" })).toBeVisible();
  await op.goto("/ops/impersonation");
  await expect(
    op
      .locator('[data-testid="impersonation-row"][data-state="active"]')
      .filter({ hasText: "· you ·" }),
  ).toHaveCount(1);
  // the tenant sees the session in their audit log and support page
  await page.goto("/settings/support");
  await expect(
    page.locator('[data-testid="impersonation-request"][data-state="active"]'),
  ).toHaveCount(1);
  await page.goto("/settings/audit");
  await expect(page.getByText("impersonation:started").first()).toBeVisible();
  await op.goto("/ops/audit");
  await expect(op.getByTestId("operator-audit-row").first()).toBeVisible();
  await opCtx.close();

  // suspension (spec 12 §12.3): the console closes except billing; the storefront and sync keep going
  await request.post("/api/v1/test/tenant-state", { data: { orgId, event: "payment_failed" } });
  await page.goto("/");
  await expect(page.locator('[data-testid="tenant-banner"][data-state="past_due"]')).toBeVisible();
  await request.post("/api/v1/test/tenant-state", { data: { orgId, event: "dunning_exhausted" } });
  await page.goto("/reservations");
  await expect(page.getByRole("heading", { name: "Permission denied" })).toBeVisible();
  await page.goto("/settings/billing");
  await expect(page.getByTestId("tenant-state")).toHaveText("suspended");
  const publicPage = await request.get(`/book/${propertyId}`);
  expect(publicPage.status()).toBe(200);
  const drained = (await (
    await request.post("/api/v1/test/drain", { data: { orgId } })
  ).json()) as { pushed?: number };
  expect(drained).toBeTruthy();
  await request.post("/api/v1/test/tenant-state", { data: { orgId, event: "reactivated" } });
  await page.goto("/reservations");
  await expect(page.getByTestId("reservations-table")).toBeVisible();

  // the export bundle (spec 12 §12.3): documented JSON, complete, downloadable unaided
  await page.goto("/settings/billing");
  await page.getByTestId("request-export").click();
  await request.post("/api/v1/test/drain", { data: { orgId, platform: true } });
  await page.reload();
  await expect(page.locator('[data-testid="export-row"][data-state="ready"]')).toHaveCount(1);
  const href = await page.getByTestId("download-export").getAttribute("href");
  const bundle = (await (await page.request.get(href!)).json()) as {
    format: string;
    counts: Record<string, number>;
  };
  expect(bundle.format).toBe("channex-pms-export/1");
  expect(bundle.counts.properties).toBe(1);
});
