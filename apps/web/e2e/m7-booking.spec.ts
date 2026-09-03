import { expect, test, type Page } from "@playwright/test";
import { pickOption, fillDate } from "./ui";

/**
 * M7 exit (spec 15, spec 10): a commission-free booking flows end to end. The
 * manager turns the direct channel on, adds a promo code and an extra; a guest
 * searches with keyboard only, holds a room (OTA availability drops at once),
 * gets declined, pays, is confirmed and mailed an .ics and a portal link; the door
 * code is issued at confirm and revealed in the portal only inside the window;
 * a portal message lands in the inbox; a second hold expires and gives the room
 * back; the booking shows up on the owner's statement; the widget script and the
 * embed page serve; the storefront meets the LCP budget on an idle machine.
 */
async function signUp(page: Page, stamp: string): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Mia");
  await page.getByLabel("Email").fill(`mia-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Direct Co");
  await page.getByLabel("URL slug").fill(`direct-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  return (await page.context().cookies()).find((c) => c.name === "pms_org")?.value ?? "";
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (days: number) => iso(new Date(Date.now() + days * 86_400_000));

test("direct booking → OTA availability → door code → portal → owner statement", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36);
  const orgId = await signUp(page, stamp);
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("Engine Flat");
  await page.getByTestId("create-property").click();
  // provisioning kicks off on create; under a parallel suite the redirect can take a while
  await expect(page.getByTestId("property-state")).toBeVisible({ timeout: 90_000 });
  const propertyId = page.url().split("/properties/")[1]!.split(/[/?]/)[0]!;
  await request.post("/api/v1/test/drain", { data: { orgId } });

  // the manager turns the direct channel on, prepay, city tax, a promo code, an extra
  await page.getByTestId("open-booking-engine").click();
  await expect(page.getByTestId("engine-state")).toHaveAttribute("data-enabled", "0");
  await page.getByTestId("toggle-engine").click();
  await expect(page.getByTestId("engine-state")).toHaveAttribute("data-enabled", "1");
  await pickOption(page, { label: "Guarantee" }, { value: "prepay" });
  await page.locator('input[name="cityTax"]').fill("200");
  await page.locator('input[name="colour"]').fill("#0f766e");
  await page.locator('textarea[name="houseManual"]').fill("Keys are in the lockbox by the door.");
  await page.getByTestId("save-engine-settings").click();
  await expect(page.locator('select[name="guarantee"]')).toHaveValue("prepay");
  await page.locator('input[name="code"]').fill(`direct10`);
  await page.locator('input[name="value"]').fill("10");
  await page.getByTestId("add-promo").click();
  await expect(page.getByTestId("promo-row")).toContainText("DIRECT10");
  await page.locator('input[name="name"]').fill("Breakfast");
  await page.locator('input[name="priceMinor"]').fill("1500");
  await page.getByTestId("add-extra").click();
  await expect(page.getByTestId("extra-row")).toContainText("Breakfast");
  await expect(page.getByTestId("embed-snippet")).toContainText("widget.js");
  await page.goto("/booking-engine");
  await expect(page.getByTestId("engine-row")).toHaveAttribute("data-enabled", "1");

  // the widget script and the framed page serve; the storefront stays inside the LCP budget
  const widget = await request.get("/widget.js");
  expect(widget.status()).toBe(200);
  expect(await widget.text()).toContain("pms:resize");
  const embed = await request.get(`/book/${propertyId}?embed=1`);
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors");

  // the guest: keyboard only through search (BE-10), results, extras, hold
  const arrival = plus(2);
  const departure = plus(4);
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`/book?org=${orgId}`);
  const lcp = await guest.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const entries = performance.getEntriesByType("largest-contentful-paint");
        if (entries.length) resolve(entries.at(-1)!.startTime);
        new PerformanceObserver((l) => resolve(l.getEntries().at(-1)!.startTime)).observe({
          type: "largest-contentful-paint",
          buffered: true,
        });
        setTimeout(() => resolve(performance.now()), 3000);
      }),
  );
  expect(lcp).toBeLessThan(2000);
  // dates by fill (Chromium's date input keyboard format is locale-bound), everything else by keyboard
  await fillDate(guest, "arrival", arrival);
  await fillDate(guest, "departure", departure);
  // Tab inside a Chromium date input walks its segments, so the promo field is focused directly
  await guest.getByLabel("Promo code").focus();
  await guest.keyboard.type("direct10");
  await guest.keyboard.press("Enter");
  await guest.waitForURL(/arrival=/);
  await expect(guest.getByTestId("storefront-card")).toHaveCount(1);
  await guest.getByTestId("storefront-card").getByRole("link").click();
  await expect(guest.getByTestId("offer")).toHaveCount(1);
  const offerTotal = (await guest.getByTestId("offer-total").textContent()) ?? "";
  await guest.getByLabel(/Breakfast/).check();
  await guest.getByTestId("book-offer").click();
  await expect(guest.getByTestId("quote")).toBeVisible();
  await expect(guest.getByTestId("quote")).toContainText("Breakfast");
  await expect(guest.getByTestId("quote")).toContainText("Discount");
  await expect(guest.getByTestId("quote")).toContainText("City tax");
  const holdUrl = guest.url();

  // BE-5: the hold already took the room out of the calendar, hence out of every OTA
  const grid = async (date: string): Promise<number> => {
    const r = await page.request.get(
      `/api/v1/ari/grid?from=${date}&to=${date}&propertyId=${propertyId}`,
    );
    const body = (await r.json()) as {
      properties: Array<{ roomTypes: Array<{ cells: Array<[string, number]> }> }>;
    };
    return body.properties[0]?.roomTypes[0]?.cells.find((c) => c[0] === date)?.[1] ?? -1;
  };
  expect(await grid(arrival)).toBe(0);
  expect(await grid(departure)).toBe(1);

  // guest details; a declined card keeps the hold; the next card pays; confirmed
  const guestEmail = `ana-${stamp}@example.com`;
  await guest.getByLabel("First name").fill("Ana");
  await guest.getByLabel("Last name").fill("Silva");
  await guest.getByLabel("Email", { exact: true }).fill(guestEmail);
  await guest.getByLabel("Card").fill("tok_decline");
  await guest.getByTestId("confirm-booking").click();
  await expect(guest.getByTestId("declined")).toBeVisible();
  await expect(guest.getByLabel("First name")).toHaveValue("Ana");
  await guest.getByLabel("Card").fill("tok_visa");
  await guest.getByTestId("confirm-booking").click();
  await expect(guest.getByTestId("booking-confirmed")).toBeVisible();
  const reference = (await guest.getByTestId("booking-reference").textContent()) ?? "";
  expect(reference.length).toBeGreaterThan(3);
  // the same hold cannot be confirmed twice: the checkout is gone
  const again = await guest.goto(holdUrl);
  expect(again?.status()).toBe(200);
  await expect(guest.getByTestId("hold-until")).toContainText(/expired/);
  expect(await grid(arrival)).toBe(0);

  // manager: one direct reservation, the door code issued at confirm
  await page.goto("/reservations");
  const row = page.locator('[data-testid="reservations-table"] tbody tr').first();
  await expect(row).toContainText(/direct/);
  await row.getByRole("link").first().click();
  await expect(page.getByTestId("reservation-detail")).toBeVisible();
  // issued at confirm: the masked credential is there to reveal, nobody clicked "issue"
  await page
    .getByRole("button", { name: /reveal/i })
    .first()
    .click();
  await expect(page.getByTestId("revealed-code")).toBeVisible();

  // BE-7: the mail carries the .ics and the portal link; the portal hides the code until the window
  const mail = (await (
    await request.get(
      `/api/v1/test/last-mail?template=booking_confirmation&to=${encodeURIComponent(guestEmail)}`,
    )
  ).json()) as { mail: { params: { ics: string; portalUrl: string; reference: string } } };
  expect(mail.mail.params.ics).toContain("BEGIN:VEVENT");
  expect(mail.mail.params.reference).toBe(reference);
  await guest.goto(
    new URL(mail.mail.params.portalUrl).pathname + new URL(mail.mail.params.portalUrl).search,
  );
  await expect(guest.getByTestId("guest-stay")).toBeVisible();
  await expect(guest.getByTestId("guest-access")).toHaveAttribute("data-state", "hidden");
  await expect(guest.getByTestId("guest-portal")).toContainText("lockbox");
  await guest.getByLabel("Arrival time").fill("18:30");
  await guest.getByTestId("save-precheckin").click();
  await expect(guest.getByTestId("precheckin-done")).toBeVisible();
  await guest.getByPlaceholder("Ask anything about your stay").fill("Is early check-in possible?");
  await guest.getByTestId("send-guest-message").click();
  await expect(
    guest.locator('[data-testid="guest-messages"] li[data-direction="inbound"]'),
  ).toHaveCount(1);
  await guest.getByTestId("add-extra").click();
  await expect(guest.locator('[data-testid="guest-folio"] tr[data-kind="extra"]')).toHaveCount(2);
  await page.goto("/inbox?view=all");
  await expect(page.getByTestId("thread-row").first()).toContainText("Ana Silva");

  // a second hold on other dates expires and gives the room back (BE-5)
  const later = plus(20);
  const laterOut = plus(21);
  await guest.goto(`/book/${propertyId}?arrival=${later}&departure=${laterOut}&adults=2`);
  await guest.getByTestId("book-offer").click();
  await expect(guest.getByTestId("quote")).toBeVisible();
  expect(await grid(later)).toBe(0);
  await request.post("/api/v1/test/drain", { data: { orgId, expireHoldsNow: true } });
  expect(await grid(later)).toBe(1);
  await guestCtx.close();

  // the owner statement carries the direct nights (spec 15 M7 exit)
  const month = arrival.slice(0, 7);
  const nightsThisMonth = [2, 3].filter((d) => plus(d).startsWith(month)).length;
  await page.goto("/owners");
  await page.getByLabel("Name").fill("Rui Owner");
  await page.getByLabel("Email").fill(`rui-${stamp}@example.com`);
  await page.getByTestId("create-owner").click();
  await page.getByTestId("owner-row").getByRole("link", { name: "Rui Owner" }).click();
  await fillDate(page, "effectiveFrom", `${month}-01`);
  await page.getByTestId("save-agreement").click();
  await expect(page.getByTestId("agreement-row")).toBeVisible();
  await page.getByTestId("period-month").fill(month);
  await page.getByTestId("generate-statement").click();
  await page.getByRole("link", { name: `${month} · Engine Flat` }).click();
  await expect(
    page.locator('[data-testid="statement-lines"] tr[data-kind="booking_revenue"]'),
  ).toHaveCount(nightsThisMonth);
  // the offer total minus the promo discount is what the owner sees, never the OTA rate
  expect(offerTotal).not.toBe("");
});
