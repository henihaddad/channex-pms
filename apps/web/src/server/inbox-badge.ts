import { asSystem, DrizzleMessagingRepository } from "@pms/db";
import { container } from "./container";

/** MSG-2: unread and SLA counts for the global nav; a read of counts only, no bodies. */
export async function inboxBadge(
  orgId: string,
  userId: string,
): Promise<{ unread: number; breaching: number }> {
  try {
    const c = await container();
    const counts = await asSystem(c.db.db, orgId, (tx) =>
      new DrizzleMessagingRepository(tx, orgId, c.crypto).counts(userId, new Date().toISOString()),
    );
    return { unread: counts.unread, breaching: counts.breaching };
  } catch {
    return { unread: 0, breaching: 0 };
  }
}
