import { asSystem, rawRows, sql } from "@pms/db";
import { container } from "./container";

/**
 * The counts on the Reservations tabs ("Requests · 2", "Needs a room · 1"): open Airbnb
 * requests and bookings that cannot be prepared until they have a room. Counts only, no PII.
 */
export async function reservationBadges(
  orgId: string,
): Promise<{ requests: number; needsRoom: number }> {
  try {
    const c = await container();
    const [r] = await asSystem(c.db.db, orgId, (tx) =>
      rawRows<{ requests: number; needs_room: number }>(
        tx,
        sql`select
          (select count(*)::int from booking_request r where r.org_id = ${orgId} and r.state in ('open', 'deciding')) as requests,
          (select count(*)::int from booking b where b.org_id = ${orgId} and b.mapping_state <> 'mapped' and b.status <> 'cancelled') as needs_room`,
      ),
    );
    return { requests: r?.requests ?? 0, needsRoom: r?.needs_room ?? 0 };
  } catch {
    return { requests: 0, needsRoom: 0 };
  }
}
