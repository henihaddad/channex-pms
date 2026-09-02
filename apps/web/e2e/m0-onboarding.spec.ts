import { expect, test } from "@playwright/test";

/**
 * M0 exit criterion (spec 15): sign up, create an org, invite a colleague with a
 * role; every action audited; the invitee lands in the console with that role.
 */
test("sign up, invite a colleague, accept, and see it audited", async ({
  page,
  browser,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const owner = { email: `ana-${stamp}@example.com`, password: "correct horse battery staple" };

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByLabel("Organization name").fill("Coastal Stays");
  await page.getByLabel("URL slug").fill(`coastal-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  // invite a colleague as property_manager
  await page.goto("/settings/members");
  await page.getByLabel("Email").fill(`bob-${stamp}@example.com`);
  await page.getByLabel("Role").selectOption("property_manager");
  await page.getByRole("button", { name: "Invite a colleague" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(`bob-${stamp}@example.com`);

  // the audit log shows the invitation and verifies
  await page.goto("/settings/audit");
  await expect(page.getByText(/chain intact/)).toBeVisible();
  await expect(page.locator("code", { hasText: "member:invite" }).first()).toBeVisible();

  // fetch the invitation token through the test-only hook (console mailer logs it); use the API to read pending invites
  const invites = await request.get("/api/v1/test/last-invitation", {
    params: { email: `bob-${stamp}@example.com` },
  });
  test.skip(invites.status() === 404, "test hook disabled");
  const { orgId, token } = (await invites.json()) as { orgId: string; token: string };

  const ctx = await browser.newContext();
  const bob = await ctx.newPage();
  await bob.goto(`/invite/${orgId}/${token}`);
  await bob.getByLabel("Your name").fill("Bob");
  await bob.getByLabel(/Choose a password/).fill("another strong password!");
  await bob.getByRole("button", { name: "Accept invitation" }).click();
  await expect(bob.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  // property_manager has no audit:read: the page must deny, not leak
  const res = await bob.goto("/settings/audit");
  expect(res?.status()).toBe(403);
  await ctx.close();
});

test("cross-tenant: a user cannot act inside an organization they hold no grant in", async ({
  page,
  baseURL,
}) => {
  const a = await signUp(page.request, "a");
  const b = await signUp(page.request, "b"); // the page context now holds B's session cookies
  expect(a.orgId).not.toBe(b.orgId);
  await page.context().addCookies([{ name: "pms_org", value: a.orgId, url: baseURL! }]);
  const res = await page.goto("/settings/members");
  expect(res?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: /Permission denied/ })).toBeVisible();
});

async function signUp(
  request: import("@playwright/test").APIRequestContext,
  tag: string,
): Promise<{ orgId: string; userId: string }> {
  const stamp = Date.now().toString(36) + tag;
  const res = await request.post("/api/v1/auth/signup", {
    data: {
      email: `${tag}-${stamp}@example.com`,
      password: "correct horse battery staple",
      name: tag,
      organizationName: tag,
      slug: `org-${stamp}`,
      country: "PT",
      currency: "EUR",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { orgId: string; userId: string };
}
