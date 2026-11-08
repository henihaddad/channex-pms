import { asSystem, DrizzleMessagingRepository, rawRows, sql } from "@pms/db";
import { container } from "./container";

/** MSG-2: unread and SLA counts for the global nav; a read of counts only, no bodies. */
export async function inboxBadge(
  orgId: string,
  userId: string,
): Promise<{ unread: number; breaching: number; reviewsToAnswer: number }> {
  try {
    const c = await container();
    return await asSystem(c.db.db, orgId, async (tx) => {
      const counts = await new DrizzleMessagingRepository(tx, orgId, c.crypto).counts(
        userId,
        new Date().toISOString(),
      );
      // "Reviews · 2" on the Inbox tabs: reviews still waiting for a reply the channel accepts
      const [r] = await rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from review where org_id = ${orgId} and response_state = 'pending'`,
      );
      return {
        unread: counts.unread,
        breaching: counts.breaching,
        reviewsToAnswer: Number(r?.n ?? 0),
      };
    });
  } catch {
    return { unread: 0, breaching: 0, reviewsToAnswer: 0 };
  }
}
