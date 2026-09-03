import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { Card, PageTitle } from "@/components/ui";

interface Row {
  id: string;
  title: string;
  enabled: boolean;
  holds: number;
  direct: number;
  saved: number;
  currency: string;
}

const loadIndex = withPermission<[], Row[]>(
  "channel:read",
  { scope: "organization", audit: false },
  async (ctx) =>
    rawRows<Row>(
      ctx.tx,
      sql`select p.id, p.title, p.currency, coalesce(s.enabled, false) as enabled,
            (select count(*)::int from booking_hold h where h.property_id = p.id and h.state = 'held' and h.expires_at > now()) as holds,
            (select count(*)::int from booking b where b.property_id = p.id and b.ota_name = 'direct' and b.status <> 'cancelled' and b.created_at > now() - interval '90 days') as direct,
            (select coalesce(sum(b.total_amount_minor), 0)::bigint * 15 / 100 from booking b where b.property_id = p.id and b.ota_name = 'direct' and b.status <> 'cancelled' and b.created_at > now() - interval '90 days') as saved
          from property p left join booking_engine_settings s on s.property_id = p.id
          where p.archived_at is null order by p.title`,
    ),
);

/** Portfolio view of the direct channel: which listings sell direct, live holds, bookings and the commission they did not pay (spec 10 §10.8). */
export default async function BookingEngineIndexPage() {
  const rows = await loadIndex();
  const t = await getTranslations("engine");
  return (
    <div className="space-y-4">
      <PageTitle>{t("index")}</PageTitle>
      <Card>
        <table className="w-full text-sm" data-testid="engine-index">
          <thead className="text-start text-xs text-muted">
            <tr>
              <th className="text-start">{t("property")}</th>
              <th className="text-start">{t("state")}</th>
              <th className="text-end">{t("holdsLive")}</th>
              <th className="text-end">{t("directBookings")}</th>
              <th className="text-end">{t("commissionSaved")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="engine-row" data-enabled={r.enabled ? "1" : "0"}>
                <td>
                  <Link href={`/properties/${r.id}/booking-engine`} className="underline">
                    {r.title}
                  </Link>
                </td>
                <td>{r.enabled ? t("enabled") : t("disabled")}</td>
                <td className="text-end">{r.holds}</td>
                <td className="text-end">{r.direct}</td>
                <td className="text-end">
                  {(Number(r.saved) / 100).toFixed(2)} {r.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Commission saved assumes a 15 % OTA rate on the same revenue.
        </p>
      </Card>
    </div>
  );
}
