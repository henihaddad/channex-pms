import { expect, test } from "@playwright/test";

/** Webhook receiver (spec 05 §5.5): secret checked in constant time, persist-first, duplicates absorbed, unknown events accepted. */
test("Channex webhook receiver persists first and deduplicates", async ({ request }) => {
  const stamp = Date.now().toString(36);
  const signup = await request.post("/api/v1/auth/signup", {
    data: {
      email: `wh-${stamp}@example.com`,
      password: "correct horse battery staple",
      name: "W",
      organizationName: "W",
      slug: `wh-${stamp}`,
      country: "PT",
      currency: "EUR",
    },
  });
  const { orgId } = (await signup.json()) as { orgId: string };
  const created = await request.post("/api/v1/test/property", {
    data: { orgId, secret: "s3cret" },
  });
  test.skip(created.status() === 404, "test hooks disabled");
  const { token } = (await created.json()) as { token: string };

  const payload = {
    event: "booking_new",
    property_id: "cx-prop",
    timestamp: "2026-09-02T10:00:00Z",
    user_id: null,
    payload: { booking_id: "cx-b1", revision_id: "cx-r1" },
  };
  const noSecret = await request.post(`/webhooks/channex/${token}`, { data: payload });
  expect(noSecret.status()).toBe(401);
  const unknown = await request.post(`/webhooks/channex/nope`, {
    data: payload,
    headers: { "x-channex-webhook-secret": "s3cret" },
  });
  expect(unknown.status()).toBe(404);

  const started = Date.now();
  const first = await request.post(`/webhooks/channex/${token}`, {
    data: payload,
    headers: { "x-channex-webhook-secret": "s3cret" },
  });
  expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({ ok: true, duplicate: false });
  expect(Date.now() - started).toBeLessThan(1000);
  const again = await request.post(`/webhooks/channex/${token}`, {
    data: payload,
    headers: { "x-channex-webhook-secret": "s3cret" },
  });
  expect(await again.json()).toEqual({ ok: true, duplicate: true });
  const weird = await request.post(`/webhooks/channex/${token}`, {
    data: { event: "something_new", timestamp: "2026-09-02T10:01:00Z", payload: {} },
    headers: { "x-channex-webhook-secret": "s3cret" },
  });
  expect(weird.status()).toBe(200);
});
