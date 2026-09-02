import { rawRows, sql, withoutTenant } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: a stay gets reviewed on the FakeProvider. */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  if (!c.fake) throw notFound();
  const body = (await req.json()) as {
    propertyId: string;
    bookingId?: string;
    rating: number;
    text: string;
    guestName?: string;
  };
  const [p] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ remote: string | null }>(
      tx,
      sql`select channex_property_id as remote from property where id = ${body.propertyId}`,
    ),
  );
  if (!p?.remote) throw notFound();
  c.fake.nowSource = () => new Date().toISOString();
  const id = c.fake.emitReview({
    propertyId: p.remote,
    rating: body.rating,
    text: body.text,
    ...(body.bookingId ? { bookingId: body.bookingId } : {}),
    ...(body.guestName ? { guestName: body.guestName } : {}),
  });
  return Response.json({ reviewId: id }, { status: 201 });
});
