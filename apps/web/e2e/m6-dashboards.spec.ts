import { expect, test, type Page } from "@playwright/test";

/**
 * M6 exit (spec 15, spec 11 §11.6): after a rollup the dashboard, the report
 * and the CSV export show the same occupancy; pace is marked unavailable; a
 * low-occupancy alert is raised and can be actioned; the portfolio dashboard on
 * the 200-listing seed loads under 2 s.
 */
async function signUp(page: Page, stamp: string): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Rev");
  await page.getByLabel("Email").fill(`rev-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("KPI Co");
  await page.getByLabel("URL slug").fill(`kpi-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /need me/ })).toBeVisible();
  return (await page.context().cookies()).find((c) => c.name === "pms_org")?.value ?? "";
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

test("rollup → dashboard, report and export agree; alerts; 200-property dashboard under 2 s", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const orgId = await signUp(page, stamp);
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("KPI Flat");
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-state")).toBeVisible();
  await request.post("/api/v1/test/drain", { data: { orgId } });

  // two staff bookings this month, from today
  const now = new Date();
  const month = iso(now).slice(0, 7);
  for (const [offset, name] of [
    [0, "Ana"],
    [3, "Bo"],
  ] as const) {
    await page.goto("/reservations/new");
    await expect(page.getByLabel("Rate plan").locator("option")).toHaveCount(1);
    await page.getByLabel("Arrival").fill(iso(new Date(now.getTime() + offset * 86_400_000)));
    await page
      .getByLabel("Departure")
      .fill(iso(new Date(now.getTime() + (offset + 2) * 86_400_000)));
    await page.getByLabel("Guest first name").fill(name);
    await page.getByLabel("Guest surname").fill("Silva");
    await page.getByLabel("Email").fill(`${name.toLowerCase()}-${stamp}@example.com`);
    await page.getByTestId("create-booking").click();
    await expect(page.getByTestId("reservation-detail")).toBeVisible({ timeout: 60_000 });
  }
  const drained = (await (
    await request.post("/api/v1/test/drain", { data: { orgId, rollups: true } })
  ).json()) as { rollups: { days: number } };
  expect(drained.rollups.days).toBeGreaterThan(0);

  // the dashboard's MTD occupancy equals the report's and the export's
  await page.goto("/");
  await expect(page.getByTestId("dashboard")).toHaveAttribute("data-role", "portfolio");
  const occ = (await page.getByTestId("occupancy-mtd").textContent()) ?? "";
  const occValue = /(\d+\.\d)%/.exec(occ)?.[1];
  expect(occValue).toBeDefined();
  await expect(page.getByTestId("pace")).toContainText("needs a year");
  await expect(page.getByTestId("league-row")).toHaveCount(1);
  const from = `${month}-01`;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const to = iso(next);
  await page.goto(`/reports?key=kpi_summary&from=${from}&to=${to}`);
  await expect(page.getByTestId("report-result")).toContainText(`${occValue}%`);
  const csv = await page.request.get(`/api/v1/reports/kpi_summary.csv?from=${from}&to=${to}`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(`${occValue}%`);
  expect(await csv.text()).toContain("basis:");
  const pdf = await page.request.get(`/api/v1/reports/production_by_day.pdf?from=${from}&to=${to}`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  // a schedule
  await page.locator('input[name="recipients"]').fill(`boss-${stamp}@example.com`);
  await page.getByTestId("save-schedule").click();
  await expect(page.getByTestId("schedule-row")).toContainText("kpi_summary");

  // alerts: a single-unit listing with empty nights within 7 days is below 40 %
  await page.goto("/alerts");
  await expect(page.getByTestId("alert-item").first()).toHaveAttribute(
    "data-type",
    "low_occupancy",
  );
  await page.getByTestId("action-alert").first().click();
  await page.goto("/alerts?state=actioned");
  await expect(page.getByTestId("alert-item").first()).toHaveAttribute("data-state", "actioned");

  // perf budget (spec 11 §11.6): the portfolio dashboard over 200 listings
  const seeded = await request.post("/api/v1/test/seed-portfolio", {
    data: { orgId, count: 200, days: 60 },
  });
  expect(seeded.ok()).toBeTruthy();
  await request.post("/api/v1/test/drain", { data: { orgId, rollups: true } });
  const started = Date.now();
  await page.goto("/");
  await expect(page.getByTestId("league-row").first()).toBeVisible();
  const ms = Date.now() - started;
  expect(await page.getByTestId("league-row").count()).toBeGreaterThanOrEqual(200);
  expect(ms).toBeLessThan(2000);
});
