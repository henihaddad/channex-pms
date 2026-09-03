import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { Card, PageTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";

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
        <Table data-testid="engine-index">
          <THead>
            <Tr>
              <Th>{t("property")}</Th>
              <Th>{t("state")}</Th>
              <Th className="text-end">{t("holdsLive")}</Th>
              <Th className="text-end">{t("directBookings")}</Th>
              <Th className="text-end">{t("commissionSaved")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id} data-testid="engine-row" data-enabled={r.enabled ? "1" : "0"}>
                <Td>
                  <Link href={`/properties/${r.id}/booking-engine`} className="underline">
                    {r.title}
                  </Link>
                </Td>
                <Td>{r.enabled ? t("enabled") : t("disabled")}</Td>
                <Td className="text-end">{r.holds}</Td>
                <Td className="text-end">{r.direct}</Td>
                <Td className="text-end">
                  {(Number(r.saved) / 100).toFixed(2)} {r.currency}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-muted">
          Commission saved assumes a 15 % OTA rate on the same revenue.
        </p>
      </Card>
    </div>
  );
}
