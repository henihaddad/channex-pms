import { computeAvailable, LocalDate } from "@pms/core";
import {
  bookedNightsByRoomType,
  DrizzleAriStore,
  DrizzleOperationsRepository,
  rawRows,
  sql,
  type Tx,
} from "@pms/db";
import { queueAriPush } from "./ari-events.js";

/**
 * INV-2 in one place: available = count − booked − out of order − blocks − keep-back,
 * recomputed for a room type over a date range and queued for push. Used after
 * blocks, unit status changes, unmapped-booking resolution and staff bookings.
 */
export async function recomputeAvailability(
  tx: Tx,
  orgId: string,
  propertyId: string,
  roomTypeId: string,
  dateFrom: string,
  dateTo: string,
  nowMs: number,
  source: string,
): Promise<{ cells: number; overbooked: number }> {
  const [rt] = await rawRows<{ count_of_rooms: number }>(
    tx,
    sql`select count_of_rooms from room_type where id = ${roomTypeId}`,
  );
  if (!rt) return { cells: 0, overbooked: 0 };
  const booked = await bookedNightsByRoomType(tx, propertyId, dateFrom, dateTo);
  const blocked = await new DrizzleOperationsRepository(tx, orgId).blockedCount(
    propertyId,
    roomTypeId,
    dateFrom,
    dateTo,
  );
  const store = new DrizzleAriStore(tx);
  let cells = 0;
  let overbooked = 0;
  for (let d = LocalDate.parse(dateFrom); !d.isAfter(LocalDate.parse(dateTo)); d = d.plusDays(1)) {
    const date = d.toString();
    const r = computeAvailable({
      countOfRooms: rt.count_of_rooms,
      booked: booked.get(`${roomTypeId}|${date}`) ?? 0,
      outOfOrder: 0,
      blocks: blocked.get(date) ?? 0,
      keepBack: 0,
    });
    if (r.overbookedBy > 0) overbooked++;
    await store.setAvailability(propertyId, orgId, roomTypeId, date, r.available, source);
    cells++;
  }
  if (cells > 0) await queueAriPush(tx, orgId, propertyId, nowMs, source);
  return { cells, overbooked };
}
