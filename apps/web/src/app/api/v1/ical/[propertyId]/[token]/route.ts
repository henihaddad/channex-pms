import { closedRanges, icalFeed } from "@pms/core";
import { asSystem, rawRows, sql, withoutTenant } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { icalToken } from "@/server/ical";

/**
 * The iCal export of one property (Channels board): the next year's nights that cannot be sold —
 * no room left, or every rate plan stopped — as all-day events. The link carries a hash of the
 * property's webhook token, so it is unguessable and rotating that token revokes it.
 */
export const GET = publicRoute("calendar_export", async (_req, params) => {
  const propertyId = String(params.propertyId ?? "");
  const token = String(params.token ?? "").replace(/\.ics$/, "");
  if (!/^[0-9a-f-]{36}$/.test(propertyId)) throw notFound();
  const c = await container();
  const [p] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string; title: string; webhook_token: string | null }>(
      tx,
      sql`select org_id, title, webhook_token from property where id = ${propertyId} and archived_at is null`,
    ),
  );
  if (!p?.webhook_token || icalToken(c.crypto, p.webhook_token) !== token) throw notFound();
  const today = c.clock.today("UTC").toString();
  const nights = await asSystem(c.db.db, p.org_id, (tx) =>
    rawRows<{ date: string }>(
      tx,
      sql`select date::text from availability_day where property_id = ${propertyId} and date >= ${today}::date and date < ${today}::date + 365
            group by date having bool_and(available <= 0)
          union
          select date::text from rate_day where property_id = ${propertyId} and date >= ${today}::date and date < ${today}::date + 365
            group by date having bool_and(coalesce((values->>'stopSell')::boolean, false))`,
    ),
  );
  const body = icalFeed({
    calendarName: p.title,
    propertyId,
    ranges: closedRanges(nights.map((n) => n.date)),
    stamp: c.clock.now().toString(),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
});
