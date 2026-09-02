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
  const body = (await req.json()) as { orgId: string; count?: number; days?: number };
  const count = Math.min(body.count ?? 200, 500);
  const days = Math.min(body.days ?? 120, 400);
  const today = c.clock.today("UTC").toString();
  await asSystem(c.db.db, body.orgId, async (tx) => {
    const repo = new DrizzlePropertyRepository(tx, body.orgId);
    for (let i = 0; i < count; i++) {
      const propertyId = Id.next();
      const rtId = Id.next();
      const rpId = Id.next();
      await tx.insert(schema.property).values({
        id: propertyId,
        orgId: body.orgId,
        kind: "single_unit",
        title: `Perf Listing ${String(i + 1).padStart(3, "0")}`,
        currency: "EUR",
        timezone: "UTC",
        state: "live",
      });
      await tx.insert(schema.roomType).values({
        id: rtId,
        orgId: body.orgId,
        propertyId,
        title: `Perf Listing ${String(i + 1)}`,
        countOfRooms: 1,
        isSystemManaged: true,
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
        select '${body.orgId}', '${propertyId}', '${rpId}', d::date, '{"rate": ${String(8000 + (i % 7) * 500)}, "minStay": 1}'::jsonb, 'synced', 'seed'
        from generate_series('${today}'::date, '${today}'::date + ${String(days - 1)}, '1 day') d`);
      await repo.seedAvailability(propertyId, rtId, today, days, 1);
    }
  });
  return Response.json({ created: count, days }, { status: 201 });
});
