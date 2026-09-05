import { expect, test, type Page } from "@playwright/test";
import { fillDate, pickOption } from "./ui";

/**
 * M4 exit (spec 15): a guest message reaches the inbox with an unread badge and
 * an SLA chip; staff reply with an interpolated template and the send button
 * names guest and channel (MSG-4); the note composer cannot reach the guest
 * (MSG-3/6, checked against the provider's ledger); an automation rule sends a
 * labelled message on booking confirmation; a review gets a response.
 */
async function signUp(page: Page, stamp: string): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Gia");
  await page.getByLabel("Email").fill(`gia-${stamp}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByLabel("Organization name").fill("Inbox Co");
  await page.getByLabel("URL slug").fill(`inbox-${stamp}`);
  await page.getByLabel("Country (ISO code)").fill("PT");
  await page.getByLabel("Currency (ISO code)").fill("EUR");
  await page.getByRole("button", { name: "Create your organization" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  return (await page.context().cookies()).find((c) => c.name === "pms_org")?.value ?? "";
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

test("guest message → inbox → template reply; note never leaves; automation and reviews", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const orgId = await signUp(page, stamp);
  const hooks = await request.post("/api/v1/test/drain", { data: { orgId } });
  test.skip(hooks.status() === 404, "test hooks disabled");

  await page.goto("/properties/new");
  await page.getByLabel("Title").fill("Inbox Flat");
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-state")).toBeVisible();
  const propertyId = page.url().split("/properties/")[1]!.split(/[?#]/)[0]!;
  await request.post("/api/v1/test/drain", { data: { orgId } });

  // a template with variables
  await page.goto("/inbox/templates");
  await page.getByLabel("Name").fill("Early check-in");
  await page
    .getByLabel("Body")
    .fill(
      "Hi {{guest.first_name}}, early check-in at {{property.name}} is fine. Book direct next time for 10% off!",
    );
  await page.getByTestId("save-template").click();
  await expect(page.getByTestId("template-row")).toContainText("Early check-in");
  await expect(page.getByTestId("promo-warning")).toBeVisible(); // AUTO-7 warns, does not block

  // a staff booking arriving tomorrow
  const d1 = iso(new Date(Date.now() + 86_400_000));
  const d2 = iso(new Date(Date.now() + 3 * 86_400_000));
  await page.goto("/reservations/new");
  await expect(page.locator('select[name="ratePlanId"] option:not([value=""])')).toHaveCount(1);
  await fillDate(page, "arrivalDate", d1);
  await fillDate(page, "departureDate", d2);
  await page.getByLabel("Guest first name").fill("Ana");
  await page.getByLabel("Guest surname").fill("Silva");
  await page.getByLabel("Email").fill(`ana-${stamp}@example.com`);
  await page.getByTestId("create-booking").click();
  // the single in-process database serialises this behind whatever the other specs are pushing
  await expect(page.getByTestId("reservation-detail")).toBeVisible({ timeout: 60_000 });
  const bookingId = page.url().split("/reservations/")[1]!.split(/[?#]/)[0]!;

  // the guest writes on Booking.com; sync brings it in within one drain
  const emitted = await request.post("/api/v1/test/message", {
    data: {
      propertyId,
      localBookingId: bookingId,
      body: "Hello! Could we check in a bit early?",
      guestName: "Ana Silva",
    },
  });
  expect(emitted.status()).toBe(201);
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.goto("/inbox");
  await expect(page.getByTestId("nav-inbox")).toContainText(/[1-9]/);
  const row = page.getByTestId("thread-row").first();
  await expect(row).toContainText("Ana Silva");
  await expect(row.getByTestId("unread")).toHaveText("1");
  await expect(row.getByTestId("sla-chip")).toBeVisible();
  await row.click();
  await expect(page.getByTestId("conversation")).toBeVisible();
  await expect(page.getByTestId("booking-sidebar")).toContainText(`${d1} → ${d2}`);

  // MSG-4: the send button names the guest and the channel; the template renders real values
  await pickOption(page, { testId: "template-select" }, { label: "Early check-in (en)" });
  await expect(page.getByTestId("guest-body")).toHaveValue(/Hi Ana, early check-in at Inbox Flat/);
  await expect(page.getByTestId("send-guest")).toHaveText("Send to Ana via Booking.com");
  await page.getByTestId("send-guest").click();
  await expect(page.locator('[data-testid="message"][data-kind="guest_message"]')).toHaveCount(2);
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.reload();
  await expect(page.locator('[data-testid="message"][data-delivery="sent"]')).toHaveCount(1);

  // MSG-3/5/6: the note composer is a different form with a different button; nothing reaches the provider
  await page.getByTestId("mode-note").click();
  await expect(page.getByTestId("note-composer")).toBeVisible();
  await expect(page.getByTestId("send-guest")).toHaveCount(0);
  await page.getByTestId("note-body").fill("VIP: owner's cousin. Do not send this.");
  await page.getByTestId("save-note").click();
  await expect(page.locator('[data-testid="message"][data-kind="note"]')).toContainText(
    "owner's cousin",
  );
  await request.post("/api/v1/test/drain", { data: { orgId } });
  const ledger = (await (await request.get("/api/v1/test/message")).json()) as {
    sent: Array<{ body: string }>;
  };
  expect(ledger.sent.filter((m) => m.body.includes("cousin"))).toHaveLength(0);
  expect(ledger.sent.some((m) => m.body.startsWith("Hi Ana, early check-in"))).toBe(true);

  // automation: a booking-confirmed rule; a new booking gets a labelled automated message
  await page.goto("/inbox/automation");
  await page.getByLabel("Rule name").fill("Thank you");
  await pickOption(page, { label: "Trigger" }, { value: "booking_confirmed" });
  await page.getByTestId("save-rule").click();
  await expect(page.getByTestId("rule-row")).toHaveAttribute("data-enabled", "0");
  await page.getByTestId("toggle-rule").click();
  await expect(page.getByTestId("rule-row")).toHaveAttribute("data-enabled", "1");
  await page.getByTestId("test-send").click();
  await expect(page.getByTestId("test-preview")).toContainText("Hi Ana");
  await page.goto("/reservations/new");
  await fillDate(page, "arrivalDate", iso(new Date(Date.now() + 5 * 86_400_000)));
  await fillDate(page, "departureDate", iso(new Date(Date.now() + 6 * 86_400_000)));
  await page.getByLabel("Guest first name").fill("Bo");
  await page.getByLabel("Guest surname").fill("Costa");
  await page.getByLabel("Email").fill(`bo-${stamp}@example.com`);
  await page.getByTestId("create-booking").click();
  await expect(page.getByTestId("reservation-detail")).toBeVisible({ timeout: 60_000 });
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.goto("/inbox?view=all");
  await page.getByTestId("thread-row").filter({ hasText: "Bo Costa" }).click();
  await expect(page.getByTestId("messages")).toContainText("Thank you v1");
  await expect(page.getByTestId("messages")).toContainText("Hi Bo, early check-in");
  await page.goto("/inbox/automation");
  await expect(page.getByTestId("run-row").first()).toHaveAttribute("data-state", "sent");

  // reviews: synced, responded through the provider
  await request.post("/api/v1/test/review", {
    data: {
      propertyId,
      localBookingId: bookingId,
      rating: 9,
      text: "Lovely flat, great host.",
      guestName: "Ana Silva",
    },
  });
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.goto("/reviews");
  await expect(page.getByTestId("rating")).toHaveText("9/10");
  await page.locator('input[name="body"]').fill("Thank you, Ana!");
  await page.getByTestId("respond-review").click();
  // the response is queued by a server action; drain only once it is on the page, or the drain races it
  await expect(page.getByTestId("review-response")).toContainText("(queued)");
  await request.post("/api/v1/test/drain", { data: { orgId } });
  await page.reload();
  await expect(page.getByTestId("review-response")).toContainText("(sent)");
  const after = (await (await request.get("/api/v1/test/message")).json()) as {
    reviewResponses: unknown[];
  };
  expect(after.reviewResponses).toHaveLength(1);

  // the KPI is measurable
  await page.goto("/inbox/kpi");
  await expect(page.getByTestId("kpi-overall")).toContainText(/\d+ min/);
});
