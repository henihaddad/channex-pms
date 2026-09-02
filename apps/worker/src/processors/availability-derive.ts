import type { Id } from "@pms/core";
import { computeAvailable, type DomainEvent, type RevisionDiff } from "@pms/core";
import {
  asSystem,
  bookedNightsByRoomType,
  claimEvent,
  DrizzleAriStore,
  enqueueOutbox,
  rawRows,
  sql,
  type Db,
} from "@pms/db";
import type { Logger } from "@pms/runtime";

/**
 * Consumer of booking.revision_applied: recompute availability for the room
 * types and dates the diff touched (spec 05 §5.4.2) and queue an ARI push.
 * Idempotent through processed_event; coalesced through the ari.changed dedupe key.
 */
export async function deriveAvailability(
  db: Db,
  event: DomainEvent,
  log: Logger,
  nowMs: number,
): Promise<{ cells: number; overbooked: number }> {
  const payload = event.payload as { propertyId: string; diff: RevisionDiff };
  const touched = [...payload.diff.nightsAdded, ...payload.diff.nightsRemoved].filter(
    (n) => n.roomTypeId !== null,
  );
  if (touched.length === 0) return { cells: 0, overbooked: 0 };
  return asSystem(db, event.orgId, async (tx) => {
    if (!(await claimEvent(tx, event.orgId, "availability.derive", event.dedupeKey)))
      return { cells: 0, overbooked: 0 };
    const dates = touched.map((n) => n.date).sort();
    const dateFrom = dates[0]!;
    const dateTo = dates.at(-1)!;
    const booked = await bookedNightsByRoomType(tx, payload.propertyId, dateFrom, dateTo);
    const roomTypes = await rawRows<{ id: string; count_of_rooms: number }>(
      tx,
      sql`select id, count_of_rooms from room_type where property_id = ${payload.propertyId} and archived_at is null`,
    );
    const counts = new Map(roomTypes.map((r) => [r.id, r.count_of_rooms]));
    const store = new DrizzleAriStore(tx);
    let cells = 0;
    let overbooked = 0;
    const seen = new Set<string>();
    for (const n of touched) {
      const k = `${n.roomTypeId!}|${n.date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const countOfRooms = counts.get(n.roomTypeId!);
      if (countOfRooms === undefined) continue; // unmapped or unknown room type: nothing to derive
      const { available, overbookedBy } = computeAvailable({
        countOfRooms,
        booked: booked.get(k) ?? 0,
        outOfOrder: 0,
        blocks: 0,
        keepBack: 0,
      });
      if (overbookedBy > 0) {
        overbooked += 1;
        log.error(
          { propertyId: payload.propertyId, roomTypeId: n.roomTypeId, date: n.date, overbookedBy },
          "availability.overbooked",
        );
      }
      await store.setAvailability(
        payload.propertyId,
        event.orgId,
        n.roomTypeId!,
        n.date,
        available,
        "booking",
      );
      cells += 1;
    }
    if (cells > 0) {
      await enqueueOutbox(tx, {
        type: "ari.changed",
        orgId: event.orgId,
        aggregate: { kind: "property", id: payload.propertyId as Id },
        payload: { propertyId: payload.propertyId, source: "booking" },
        occurredAt: new Date(nowMs).toISOString(),
        dedupeKey: `ari.changed:${payload.propertyId}:${String(Math.floor(nowMs / 3000))}`,
      });
    }
    return { cells, overbooked };
  });
}
