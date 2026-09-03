import { expect, test, type Page } from "@playwright/test";
import { fillDate } from "./ui";

/**
 * M5 exit (spec 15): close a month on the seed-free path. An owner with an
 * agreement, a staff booking last month, an approved expense; the statement is
 * generated, reviewed, approved and sent; the owner signs in by magic link,
 * reads the statement line by line, blocks an owner stay and disputes the
 * statement; the dispute lands in the manager's inbox and the payout is recorded.
 */
async function signUp(page: Page, stamp: string): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Fin");
  await page.getByLabel("Email").fill(`fin-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Owner Co");
  await page.getByLabel("URL slug").fill(`owner-${stamp}`);
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

test("owner agreement → statement → send → owner portal → dispute → payout", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const orgId = await signUp(page, stamp);
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("Owner Flat");
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-state")).toBeVisible();
  await request.post("/api/v1/test/drain", { data: { orgId } });

  // a booking from today (3 nights) on the single booking path; rates exist from yesterday onwards
  const now = localToday();
  const month = iso(now).slice(0, 7);
  const arr = iso(now);
  const dep = iso(new Date(now.getTime() + 3 * 86_400_000));
  const nightsThisMonth = [0, 1, 2].filter((i) =>
    iso(new Date(now.getTime() + i * 86_400_000)).startsWith(month),
  ).length;
  await page.goto("/reservations/new");
  await expect(page.locator('select[name="ratePlanId"] option:not([value=""])')).toHaveCount(1);
  await fillDate(page, "arrivalDate", arr);
  await fillDate(page, "departureDate", dep);
  await page.getByLabel("Guest first name").fill("Ana");
  await page.getByLabel("Guest surname").fill("Silva");
  await page.getByLabel("Email").fill(`ana-${stamp}@example.com`);
  await page.getByTestId("create-booking").click();
  await expect(page.getByTestId("reservation-detail")).toBeVisible({ timeout: 60_000 });

  // the owner, sealed bank details, an agreement (20 % on net of OTA commission)
  const ownerEmail = `rui-${stamp}@example.com`;
  await page.goto("/owners");
  await page.getByLabel("Name").fill("Rui Owner");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByTestId("create-owner").click();
  await page.getByTestId("owner-row").getByRole("link", { name: "Rui Owner" }).click();
  await expect(page.getByTestId("owner-detail")).toBeVisible();
  await page.locator('input[name="payoutDetails"]').fill("PT50000201231234567890154");
  await page.getByTestId("save-payout-details").click();
  await expect(page.getByTestId("payout-masked")).toHaveText("••••0154");
  await fillDate(page, "effectiveFrom", `${month}-01`);
  await page.getByTestId("save-agreement").click();
  await expect(page.getByTestId("agreement-row")).toContainText("20% commission");
  await page.getByTestId("grant-portal").click();
  await expect(page.getByTestId("portal-granted")).toBeVisible();

  // an approved, rebillable expense last month
  await page.goto("/owners/expenses");
  await fillDate(page, "date", arr);
  await page.getByLabel("Description").fill("Boiler service");
  await page.getByLabel("Amount").fill("80");
  await page.getByTestId("create-expense").click();
  await expect(page.getByTestId("expense-row")).toHaveAttribute("data-state", "submitted");
  await page.getByTestId("approve-expense").click();
  await expect(page.getByTestId("expense-row")).toHaveAttribute("data-state", "approved");

  // generate, review, approve, send
  await page.goto("/owners");
  await page.getByTestId("owner-row").getByRole("link", { name: "Rui Owner" }).click();
  await page.getByTestId("period-month").fill(month);
  await page.getByTestId("generate-statement").click();
  await page.getByRole("link", { name: `${month} · Owner Flat` }).click();
  await expect(page.getByTestId("statement-detail")).toHaveAttribute("data-state", "draft");
  await expect(
    page.locator('[data-testid="statement-lines"] tr[data-kind="booking_revenue"]'),
  ).toHaveCount(3);
  await expect(page.locator('[data-testid="statement-lines"] tr[data-kind="expense"]')).toHaveCount(
    1,
  );
  const statementUrl = page.url();
  await page.getByTestId("approve-statement").click();
  await expect(page.getByTestId("statement-detail")).toHaveAttribute("data-state", "approved");
  await page.getByTestId("send-statement").click();
  await expect(page.getByTestId("statement-detail")).toHaveAttribute("data-state", "sent");
  await expect(page.getByTestId("pdf-link")).toBeVisible();
  const netDue = await page.locator('[data-total="netDue"]').textContent();

  // the owner signs in by magic link in a fresh browser context
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.goto("/owner-login");
  await owner.getByLabel("Email").fill(ownerEmail);
  await owner.getByTestId("send-magic-link").click();
  await expect(owner.getByText(/sign-in link is on its way/)).toBeVisible();
  const mail = (await (
    await request.get(
      `/api/v1/test/last-mail?template=magic_link&to=${encodeURIComponent(ownerEmail)}`,
    )
  ).json()) as { mail: { params: { token: string } } };
  await owner.goto(`/api/v1/auth/magic?token=${mail.mail.params.token}`);
  await expect(owner.getByTestId("owner-portal")).toBeVisible();
  await owner.goto("/owner/statements");
  await owner.getByTestId("owner-statement").getByRole("link").click();
  await expect(owner.getByTestId("owner-net-due")).toHaveText(netDue ?? "");
  await expect(owner.locator('[data-testid="owner-lines"] tr')).toHaveCount(
    await page.locator('[data-testid="statement-lines"] tr').count(),
  );
  // PORT-1: no guest surname or email anywhere on the portal
  await owner.goto("/owner/calendar");
  await expect(owner.getByTestId("owner-portal")).not.toContainText("Silva");
  await expect(owner.getByTestId("owner-portal")).not.toContainText("@example.com");
  // PORT-3: an owner stay blocks inventory
  const stayFrom = iso(new Date(Date.now() + 20 * 86_400_000));
  const stayTo = iso(new Date(Date.now() + 22 * 86_400_000));
  await fillDate(owner, "dateFrom", stayFrom);
  await fillDate(owner, "dateTo", stayTo);
  await owner.getByTestId("block-owner-stay").click();
  await expect(owner.locator('[data-testid="owner-block"][data-reason="owner_stay"]')).toHaveCount(
    1,
  );
  // the dispute
  await owner.goto("/owner/statements");
  await owner.getByTestId("owner-statement").getByRole("link").click();
  await owner.getByTestId("dispute-reason").fill("The boiler was under warranty.");
  await owner.getByTestId("send-dispute").click();
  await expect(owner.getByTestId("dispute-open")).toBeVisible();
  // the owner cannot reach the console
  await owner.goto("/owners");
  await expect(owner.getByTestId("owner-detail")).toHaveCount(0);
  await ownerCtx.close();

  // manager: the dispute is a thread in the inbox; the statement stays sent; record the payout
  await page.goto("/inbox?view=all");
  await expect(page.getByTestId("thread-row").first()).toContainText("Rui Owner");
  await page.goto(statementUrl);
  await expect(page.getByTestId("statement-detail")).toHaveAttribute("data-state", "sent");
  await expect(page.getByText("disputed")).toBeVisible();
  await page.locator('input[name="reference"]').fill("SEPA-1234");
  await page.getByTestId("initiate-payout").click();
  // payout:execute is step-up gated (spec 02 §2.6): re-authenticate and come back
  await expect(page.getByRole("heading", { name: "Confirm it is you" })).toBeVisible();
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("statement-detail")).toBeVisible();
  await page.locator('input[name="reference"]').fill("SEPA-1234");
  await page.getByTestId("initiate-payout").click();
  await expect(page.getByTestId("payout-row")).toBeVisible();
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.reload();
  await expect(page.getByTestId("payout-row")).toHaveAttribute("data-state", "paid");
  await expect(page.getByTestId("statement-detail")).toHaveAttribute("data-state", "paid");
  await page.goto("/operations/blocks");
  await expect(page.getByText("owner_stay").first()).toBeVisible();
});
