import { rawRows, sql, withoutTenant } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: an Airbnb guest asks for something on the FakeProvider (spec 09 §9.8). */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  if (!c.fake) throw notFound();
  const body = (await req.json()) as {
    propertyId: string;
    kind: "inquiry" | "reservation_request" | "alteration_request";
    checkIn: string;
    checkOut: string;
    guests?: number;
    guestName?: string;
    payoutText?: string;
    localBookingId?: string;
  };
  const [p] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ remote: string | null }>(
      tx,
      sql`select channex_property_id as remote from property where id = ${body.propertyId}`,
    ),
  );
  if (!p?.remote) throw notFound();
  let bookingId: string | undefined;
  if (body.localBookingId) {
    const [b] = await withoutTenant(c.db.db, (tx) =>
      rawRows<{ cid: string }>(
        tx,
        sql`select channex_booking_id as cid from booking where id = ${body.localBookingId}`,
      ),
    );
    bookingId = b?.cid;
  }
  c.fake.nowSource = () => new Date().toISOString();
  const r = c.fake.emitBookingRequest({
    propertyId: p.remote,
    kind: body.kind,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    ...(body.guests ? { guests: body.guests } : {}),
    ...(body.guestName ? { guestName: body.guestName } : {}),
    ...(body.payoutText ? { payoutText: body.payoutText } : {}),
    ...(bookingId ? { bookingId } : {}),
  });
  return Response.json(r, { status: 201 });
});
