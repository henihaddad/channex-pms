import { expect, test } from "@playwright/test";

/** CAL-7: the 90-day, 200-listing portfolio view loads within the 2 s budget. */
test("200 listings × 90 days grid loads under 2 s", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Perf");
  await page.getByLabel("Email").fill(`perf-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Perf Org");
  await page.getByLabel("URL slug").fill(`perf-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  const orgId = (await page.context().cookies()).find((c) => c.name === "pms_org")?.value ?? "";
  const seeded = await request.post("/api/v1/test/seed-portfolio", {
    data: { orgId, count: 200, days: 120 },
  });
  test.skip(seeded.status() === 404, "test hooks disabled");
  expect(seeded.status()).toBe(201);

  // warm once (route compilation on a cold server is not what CAL-7 measures), then time the real load
  await page.goto("/calendar?days=14");
  await expect(page.getByTestId("grid-stats")).toContainText("loaded in");
  const started = Date.now();
  await page.goto("/calendar?days=90");
  await expect(page.getByTestId("grid-stats")).toContainText("loaded in");
  const total = Date.now() - started;
  const stats = await page.getByTestId("grid-stats").textContent();
  const loadMs = Number(/loaded in (\d+) ms/.exec(stats ?? "")?.[1] ?? "0");
  console.log(`grid: ${stats ?? ""}; page total ${String(total)} ms`);
  // each single_unit listing is a property row plus its rate plan row
  expect(stats).toContain("400 rows");
  expect(loadMs).toBeLessThan(2000);
  expect(total).toBeLessThan(4000);
  await expect(page.locator("[data-row-kind]").first()).toBeVisible();
});
