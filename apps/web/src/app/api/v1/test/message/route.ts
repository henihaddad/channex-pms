import { rawRows, sql, withoutTenant } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/**
 * PMS_TEST_HOOKS=1 only: a guest writes on the FakeProvider. POST emits the
 * message (and its webhook); GET reports what the provider has received from
 * us, the MSG-6 oracle for end-to-end tests.
 */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  if (!c.fake) throw notFound();
  const body = (await req.json()) as {
    propertyId: string;
    bookingId?: string;
    localBookingId?: string;
    threadId?: string;
    body: string;
    guestName?: string;
    guestLanguage?: string;
    provider?: string;
    inquiry?: boolean;
  };
  const [p] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ remote: string | null }>(
      tx,
      sql`select channex_property_id as remote from property where id = ${body.propertyId}`,
    ),
  );
  if (!p?.remote) throw notFound();
  if (body.localBookingId) {
    const [b] = await withoutTenant(c.db.db, (tx) =>
      rawRows<{ cid: string }>(
        tx,
        sql`select channex_booking_id as cid from booking where id = ${body.localBookingId}`,
      ),
    );
    if (b) body.bookingId = b.cid;
  }
  c.fake.nowSource = () => new Date().toISOString();
  const r = c.fake.emitGuestMessage({
    propertyId: p.remote,
    body: body.body,
    ...(body.bookingId ? { bookingId: body.bookingId } : {}),
    ...(body.threadId ? { threadId: body.threadId } : {}),
    ...(body.guestName ? { guestName: body.guestName } : {}),
    ...(body.guestLanguage ? { guestLanguage: body.guestLanguage } : {}),
    ...(body.provider ? { provider: body.provider } : {}),
    ...(body.inquiry ? { kind: "inquiry" as const, authorType: "system" as const } : {}),
  });
  return Response.json(r, { status: 201 });
});

export const GET = publicRoute("test_hook", async () => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  if (!c.fake) throw notFound();
  return Response.json({
    sent: c.fake.ledger.messagesSent.map((m) => ({ threadId: m.threadId, body: m.body })),
    reviewResponses: c.fake.ledger.reviewResponses,
  });
});
