import { Id } from "@pms/core";
import { asSystem, DrizzlePropertyRepository, schema } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: N live single_unit listings with `days` of cells, for the CAL-7 grid budget. */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  const body = (await req.json()) as {
    orgId: string;
    count?: number;
    days?: number;
    /** Optional per-listing titles and cover photos (cycled), for screenshots and photo-aware screens. */
    titles?: string[];
    photos?: string[];
    /** Optional per-listing cities, and rooms per listing (more than one makes a multi_unit). */
    cities?: string[];
    rooms?: number[];
    /** Added to Friday and Saturday nights, minor units (default none). */
    weekendUpliftMinor?: number;
  };
  const count = Math.min(body.count ?? 200, 500);
  const days = Math.min(body.days ?? 120, 400);
  const today = c.clock.today("UTC").toString();
  await asSystem(c.db.db, body.orgId, async (tx) => {
    const repo = new DrizzlePropertyRepository(tx, body.orgId);
    for (let i = 0; i < count; i++) {
      const propertyId = Id.next();
      const rtId = Id.next();
      const rpId = Id.next();
      const rooms = Math.max(1, Math.min(body.rooms?.[i] ?? 1, 50));
      await tx.insert(schema.property).values({
        id: propertyId,
        orgId: body.orgId,
        kind: rooms > 1 ? "multi_unit" : "single_unit",
        ...(body.cities?.[i] ? { address: { city: body.cities[i] } } : {}),
        title: body.titles?.[i] ?? `Perf Listing ${String(i + 1).padStart(3, "0")}`,
        currency: "EUR",
        timezone: "UTC",
        state: "live",
        ...(body.photos && body.photos.length > 0
          ? { settings: { content: { photos: [body.photos[i % body.photos.length]] } } }
          : {}),
      });
      await tx.insert(schema.roomType).values({
        id: rtId,
        orgId: body.orgId,
        propertyId,
        title: rooms > 1 ? "Double" : `Perf Listing ${String(i + 1)}`,
        countOfRooms: rooms,
        isSystemManaged: rooms === 1,
      });
      await tx.insert(schema.ratePlan).values({
        id: rpId,
        orgId: body.orgId,
        propertyId,
        roomTypeId: rtId,
        title: "Standard",
        currency: "EUR",
      });
      await tx.execute(`insert into rate_day (org_id, property_id, rate_plan_id, date, values, sync_state, source)
        select '${body.orgId}', '${propertyId}', '${rpId}', d::date, jsonb_build_object('rate', ${String(8000 + (i % 7) * 500)} + case when extract(isodow from d) in (5, 6) then ${String(Math.max(0, Math.round(body.weekendUpliftMinor ?? 0)))} else 0 end, 'minStay', 1), 'synced', 'seed'
        from generate_series('${today}'::date, '${today}'::date + ${String(days - 1)}, '1 day') d`);
      await repo.seedAvailability(propertyId, rtId, today, days, rooms);
    }
  });
  return Response.json({ created: count, days }, { status: 201 });
});
