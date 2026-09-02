"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Id } from "@pms/core";
import {
  applyCountChange,
  DrizzleChannelRepository,
  DrizzlePropertyRepository,
  rawRows,
  sql,
  type ConnectionRow,
  type PropertyDetail,
} from "@pms/db";
import { markAllPending, queueAriPush } from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

const byProperty = {
  scope: "property" as const,
  resolveScope: (id: string) => ({ kind: "property" as const, id }),
};

export const loadProperty = withPermission<
  [string],
  PropertyDetail & {
    connections: ConnectionRow[];
    health: Record<string, number>;
    bulkOps: Array<{ id: string; cellCount: number; state: string; createdAt: string }>;
  }
>("property:read", { ...byProperty, audit: false }, async (ctx, id) => {
  const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
  const d = await repo.get(id);
  if (!d) throw new HttpProblem(404, "not_found", "Property not found");
  const cells = await rawRows<{ sync_state: string; n: number }>(
    ctx.tx,
    sql`select sync_state, count(*)::int as n from (select sync_state from rate_day where property_id = ${id} union all select sync_state from availability_day where property_id = ${id}) x group by sync_state`,
  );
  return {
    ...d,
    connections: await new DrizzleChannelRepository(ctx.tx, ctx.orgId).listConnections(id),
    health: Object.fromEntries(cells.map((c) => [c.sync_state, c.n])),
    bulkOps: await repo.listBulkOperations(id, 10),
  };
});

const derivedSchema = z.object({
  propertyId: z.string(),
  parentRatePlanId: z.string(),
  title: z.string().min(1),
  kind: z.enum(["percent", "amount"]),
  direction: z.enum(["increase", "decrease"]),
  value: z.coerce.number().int().min(0),
});

/** Derived rate plan (spec 06 §6.1, INV-6): seeded from the parent for the whole horizon, then follows every parent edit. */
export const addDerivedPlanAction = withPermission<[FormData], void>(
  "rate_plan:create",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "rate_plan", id: String(fd.get("title")) }),
  },
  async (ctx, fd) => {
    const p = derivedSchema.safeParse(Object.fromEntries(fd.entries()));
    if (!p.success)
      throw new HttpProblem(422, "invalid", p.error.issues.map((i) => i.message).join("; "));
    try {
      await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).addDerivedRatePlan({
        id: Id.next(),
        propertyId: p.data.propertyId,
        parentRatePlanId: p.data.parentRatePlanId,
        title: p.data.title,
        option: { kind: p.data.kind, direction: p.data.direction, value: p.data.value },
      });
    } catch (e) {
      if (e instanceof RangeError) throw new HttpProblem(422, "derivation", e.message);
      throw e;
    }
    await queueAriPush(ctx.tx, ctx.orgId, p.data.propertyId, Date.now(), "rate_plan.derived");
    revalidatePath(`/properties/${p.data.propertyId}`);
  },
);

export const updateRoomTypeCountAction = withPermission<[FormData], void>(
  "room_type:update",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "room_type", id: String(fd.get("roomTypeId")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    const roomTypeId = String(fd.get("roomTypeId"));
    const count = Number(fd.get("countOfRooms"));
    if (!Number.isInteger(count) || count < 1)
      throw new HttpProblem(422, "invalid", "count must be a positive integer");
    const [rt] = await rawRows<{ count_of_rooms: number; timezone: string; property_id: string }>(
      ctx.tx,
      sql`select rt.count_of_rooms, p.timezone, rt.property_id from room_type rt join property p on p.id = rt.property_id where rt.id = ${roomTypeId}`,
    );
    if (!rt) throw new HttpProblem(404, "not_found", "Room type not found");
    await ctx.tx.execute(
      sql`update room_type set count_of_rooms = ${count}, updated_at = now() where id = ${roomTypeId}`,
    );
    await applyCountChange(
      ctx.tx,
      roomTypeId,
      count - rt.count_of_rooms,
      c.clock.today(rt.timezone).toString(),
    );
    await queueAriPush(ctx.tx, ctx.orgId, rt.property_id, Date.now(), "room_type.count");
    revalidatePath(`/properties/${rt.property_id}`);
  },
);

export const addPolicyAction = withPermission<[FormData], void>(
  "property:update",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "policy", id: String(fd.get("title")) }),
  },
  async (ctx, fd) => {
    const propertyId = String(fd.get("propertyId"));
    await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).insertPolicy({
      id: Id.next(),
      propertyId,
      title: String(fd.get("title")),
      checkInTime: String(fd.get("checkInTime") || "15:00"),
      checkOutTime: String(fd.get("checkOutTime") || "11:00"),
      cancellation: { type: String(fd.get("cancellation") || "flexible") },
    });
    revalidatePath(`/properties/${propertyId}`);
  },
);

/** CX-7 force resync: every cell back to pending and a push queued; the audit log records who asked. */
export const forceResyncAction = withPermission<[FormData], void>(
  "ari:force_resync",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
  },
  async (ctx, fd) => {
    const propertyId = String(fd.get("propertyId"));
    await markAllPending(ctx.tx, propertyId);
    await queueAriPush(ctx.tx, ctx.orgId, propertyId, Date.now(), "force_resync");
    revalidatePath(`/properties/${propertyId}`);
    revalidatePath("/sync-health");
  },
);
