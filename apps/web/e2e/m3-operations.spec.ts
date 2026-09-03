import { expect, test, type Page } from "@playwright/test";

/**
 * M3 exit (spec 15): a staff booking on the single creation path generates a
 * turnover task with no manual step; the cleaner completes it offline with a
 * photo and loses nothing on reconnect (OPS-6); the reservation detail issues a
 * door code, reveals PII under audit and invoices the folio gaplessly.
 */
async function signUp(page: Page, stamp: string): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Ops");
  await page.getByLabel("Email").fill(`ops-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Ops Co");
  await page.getByLabel("URL slug").fill(`ops-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  return (await page.context().cookies()).find((c) => c.name === "pms_org")?.value ?? "";
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Today in the property's timezone (the wizard default), at noon UTC so day offsets stay on the same date. */
function localToday(): Date {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${day}T12:00:00Z`);
}

test("staff booking → turnover task → cleaner completes offline → folio invoiced", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const orgId = await signUp(page, stamp);
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  // a listing, provisioned and live on the FakeProvider
  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("Ops Flat");
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-state")).toBeVisible();
  await request.post("/api/v1/test/drain", { data: { orgId } });

  // a checklist with a photo-required item
  await page.goto("/operations/crews");
  await page.getByLabel("Checklist name").fill("Standard changeover");
  await page.getByRole("button", { name: "Add checklist" }).click();
  // a single PGlite connection serialises the suite: the portfolio spec's provisioning can hold it for a while
  await expect(page.getByText("Standard changeover · changeover")).toBeVisible({ timeout: 90_000 });

  // staff booking arriving today, departing tomorrow; a second one arriving tomorrow makes a same-day changeover
  const today = localToday();
  const d1 = iso(today);
  const d2 = iso(new Date(today.getTime() + 86_400_000));
  const d3 = iso(new Date(today.getTime() + 3 * 86_400_000));
  for (const [arr, dep, name] of [
    [d1, d2, "Ana"],
    [d2, d3, "Bo"],
  ] as const) {
    await page.goto("/reservations/new");
    await expect(page.getByLabel("Rate plan").locator("option")).toHaveCount(1);
    await page.getByLabel("Arrival").fill(arr);
    await page.getByLabel("Departure").fill(dep);
    await page.getByLabel("Guest first name").fill(name);
    await page.getByLabel("Guest surname").fill("Silva");
    await page.getByLabel("Email").fill(`${name.toLowerCase()}-${stamp}@example.com`);
    await page.getByTestId("create-booking").click();
    await expect(page.getByTestId("reservation-detail")).toBeVisible();
  }
  await request.post("/api/v1/test/drain", { data: { orgId } });

  // the board shows the same-day changeover; assign it to me
  await page.goto(`/operations?date=${d2}`);
  const lane = page.getByTestId("turnover-lane");
  await expect(lane.locator("[data-task]")).toHaveCount(1);
  await expect(lane).toContainText("changeover");
  await lane.getByTestId("assignee").selectOption({ label: "Me" });
  await lane.getByRole("button", { name: "Assign" }).click();
  await expect(lane.locator('[data-state="assigned"]')).toHaveCount(1);

  // the cleaner app: accept, go offline, complete with a photo, come back online, nothing lost
  await page.goto("/cleaner");
  await page.locator('input[type="date"]').fill(d2);
  await expect(page.getByTestId("cleaner-task")).toHaveCount(1);
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("cleaner-task")).toHaveAttribute("data-state", "accepted");
  await page.getByTestId("on-site").click();
  await expect(page.getByTestId("item-beds_made")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId("online-state")).toHaveText("offline");
  for (const key of ["beds_made", "bathroom_cleaned", "bins_emptied", "keys_in_lockbox"])
    await page.getByTestId(`item-${key}`).check();
  await page.getByTestId("photo-beds_made").setInputFiles({
    name: "beds.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake-jpeg-bytes"),
  });
  await page.getByTestId("photo-bathroom_cleaned").setInputFiles({
    name: "bath.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake-jpeg-bytes"),
  });
  await page.getByTestId("done").click();
  await expect(page.getByTestId("pending-sync")).toContainText("waiting to sync");
  await expect(page.getByTestId("cleaner-task")).toHaveAttribute("data-state", "done");
  await context.setOffline(false);
  await expect(page.getByTestId("online-state")).toHaveText("online");
  await expect(page.getByTestId("pending-sync")).toHaveCount(0, { timeout: 20_000 });
  await page.reload();
  await page.locator('input[type="date"]').fill(d2);
  await expect(page.getByTestId("cleaner-task")).toHaveAttribute("data-state", "done");
  await page.goto(`/operations?date=${d2}`);
  await expect(page.getByTestId("turnover-lane").locator('[data-state="done"]')).toHaveCount(1);
  await page.goto("/operations/blocks");
  await expect(page.locator("select[name=status]").first()).toHaveValue("clean");

  // reservation detail: door code issued and revealed, PII under audit, invoice numbered
  await page.goto("/reservations?view=arrivals_today");
  await page.locator("[data-booking] a").first().click();
  await page.getByTestId("issue-code").click();
  await expect(page.getByTestId("issued-code")).toContainText(/\d{6}/);
  await page.getByTestId("reveal-pii").click();
  await expect(page.getByTestId("guest-pii")).toContainText("Ana Silva");
  // room revenue posts at daily close; a charge added now can be invoiced immediately, gaplessly numbered
  const folio = page.getByTestId("folio").first();
  await folio.locator("input[name=description]").fill("Late check-out");
  await folio.locator("input[name=amount]").first().fill("30");
  await folio.getByRole("button", { name: "Add charge" }).click();
  await expect(folio).toContainText("Late check-out");
  await page.getByTestId("issue-invoice").click();
  await expect(page.getByTestId("folio").first()).toContainText("INV-");
  await page.goto("/settings/audit");
  await expect(page.locator("code", { hasText: "booking:read_pii" }).first()).toBeVisible();
  await expect(page.locator("code", { hasText: "access_credential:issue" }).first()).toBeVisible();
});
