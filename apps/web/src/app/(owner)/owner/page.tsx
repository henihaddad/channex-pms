import { getTranslations } from "next-intl/server";
import { Card, DataTable, EmptyState, PageTitle, Stat } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { loadPortalHome } from "./portal.actions";

export default async function OwnerHome() {
  const t = await getTranslations("owner");
  const v = await guard(() => loadPortalHome());
  const d = v.dashboard;
  const occupancy = d.unitNights > 0 ? Math.round((d.nightsSold / d.unitNights) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{t("welcome", { name: v.ownerName })}</PageTitle>
      <Card title={t("thisMonth")} data-testid="owner-dashboard">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t("nightsSold")} value={d.nightsSold} />
          <Stat label={t("occupancy")} value={`${occupancy}%`} />
          <Stat label={t("grossRevenue")} value={money(d.grossMinor, d.currency)} />
          <Stat
            label={t("projectedNet")}
            value={
              d.projectedNetMinor === null ? (
                <span className="text-base text-muted">{t("noDraftYet")}</span>
              ) : (
                money(d.projectedNetMinor, d.currency)
              )
            }
          />
        </div>
      </Card>
      <Card title={t("nextArrivals")}>
        {d.nextArrivals.length === 0 ? (
          <EmptyState title={t("noBookings")} />
        ) : (
          <DataTable
            columns={[t("from"), t("guest"), t("property")]}
            rows={d.nextArrivals.map((a) => [a.arrivalDate, a.guestFirstName, a.propertyTitle])}
            dense
          />
        )}
      </Card>
    </div>
  );
}
