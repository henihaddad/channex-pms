import { expect, test, type Page } from "@playwright/test";

/**
 * M2 exit criterion (spec 15): a 20-listing portfolio from a template, connect
 * Airbnb (OAuth) and Booking.com, map, edit rates and see cells reach `synced`
 * through the realtime channel, all on the FakeProvider.
 */
async function signUp(page: Page, stamp: string): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Email").fill(`ana-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Coastal Stays");
  await page.getByLabel("URL slug").fill(`coastal-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  const org = (await page.context().cookies()).find((c) => c.name === "pms_org");
  return org?.value ?? "";
}

test("20 listings from a template connect Airbnb and Booking.com, map, and sync rate edits", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const orgId = await signUp(page, stamp);
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  // a template from the wizard, then 20 listings from it in one CSV import (listing #40 in three minutes)
  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("Template source");
  // wait for the action to commit: with a pooled database the list page can otherwise render first
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/properties/new"),
    ),
    page.getByRole("button", { name: "Save as template" }).click(),
  ]);
  await page.goto("/properties");
  await expect(page.getByText(/^Template /)).toBeVisible();
  await page.goto("/properties/import");
  await page.getByLabel("Template").selectOption({ index: 1 });
  const rows = Array.from(
    { length: 20 },
    (_, i) =>
      `Listing ${String(i + 1).padStart(2, "0")},single_unit,EUR,Lisbon,PT,${String(100 + i)},2`,
  );
  await page
    .getByLabel("CSV")
    .fill(["title,kind,currency,city,country,base_rate,min_stay", ...rows].join("\n"));
  await page.getByTestId("import-submit").click();
  await expect(page.locator('p[role="alert"]')).toContainText("Created 20 properties");

  // the worker's provisioning and initial push, run in-process by the test hook
  const drained = (await (
    await request.post("/api/v1/test/drain", { data: { orgId } })
  ).json()) as { provisioned: number; live: number };
  expect(drained.provisioned).toBe(20);
  expect(drained.live).toBe(20);
  await page.goto("/properties");
  await expect(page.locator('tr[data-state="live"]')).toHaveCount(20);

  // Airbnb is a primary path (CH-5): OAuth once at org level, then bulk listing import with match-or-create
  await page.goto("/channels");
  await page.getByTestId("connect-airbnb").click();
  // channel accounts are a step-up permission (spec 02 §2.4 `!`): re-enter the password once, then OAuth proceeds
  await expect(page).toHaveURL(/\/step-up/);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/channels$/);
  await expect(page.getByTestId("accounts")).toContainText("Fake Airbnb host");
  await page.getByTestId("import-listings").click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("import-result")).toContainText("connected");

  // Booking.com through the descriptor-driven wizard (CH-1..CH-6)
  await page.goto("/properties");
  const firstListing = page.getByRole("link", { name: "Listing 01" });
  const href = await firstListing.getAttribute("href");
  const propertyId = href!.split("/").pop()!;
  await page.goto(`/channels/new?propertyId=${propertyId}`);
  await page.getByLabel("Channel").selectOption("BookingCom");
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("field-hotel_id").fill("12345");
  await page.getByTestId("wizard-test").click();
  await expect(page.getByText("Connection OK")).toBeVisible();
  await page.getByTestId("wizard-load").click();
  await expect(page.getByTestId("mapping-editor")).toBeVisible();
  await expect(page.getByText(/Full coverage/)).toBeVisible();
  await page.getByTestId("wizard-create").click();
  await expect(page.getByText(/created inactive/)).toBeVisible();
  await page.getByTestId("wizard-activate").click();
  await expect(page.getByText(/Active\. A full ARI push/)).toBeVisible();
  await page.getByTestId("wizard-done").click();
  await expect(page.getByTestId("health-board").locator('[data-state="active"]')).toHaveCount(1);

  // edit a rate on the calendar: optimistic pending → synced over SSE after the push
  await page.goto(`/calendar?propertyId=${propertyId}&days=14`);
  await expect(page.getByTestId("grid-stats")).toContainText("loaded in");
  const cell = page.locator("[data-cell]").nth(3);
  const cellKey = await cell.getAttribute("data-cell");
  // keyboard-first (CAL-1): click to focus, type the new rate, Enter commits
  await cell.click();
  await page.keyboard.type("150");
  await expect(page.getByTestId("cell-editor")).toHaveValue("150");
  await page.keyboard.press("Enter");
  const edited = page.locator(`[data-cell="${cellKey}"]`);
  await expect(edited).toHaveAttribute("data-state", "pending");
  await expect(edited).toContainText("150");
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await expect(edited).toHaveAttribute("data-state", "synced", { timeout: 20_000 });

  // undo is server-backed (CAL-4): survives a reload
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Undone");
  await page.reload();
  await expect(page.locator(`[data-cell="${cellKey}"]`)).toContainText("100");
});
