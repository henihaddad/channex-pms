import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { loadPortalHome } from "./portal.actions";

export default async function OwnerHome() {
  const t = await getTranslations("owner");
  const v = await guard(() => loadPortalHome());
  const d = v.dashboard;
  const occupancy = d.unitNights > 0 ? Math.round((d.nightsSold / d.unitNights) * 100) : 0;
  return (
    <div className="space-y-4">
      <PageTitle>{t("welcome", { name: v.ownerName })}</PageTitle>
      <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="owner-dashboard">
        <div>
          <p className="text-xs text-slate-500">{t("nightsSold")}</p>
          <p className="text-xl font-semibold">{d.nightsSold}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t("occupancy")}</p>
          <p className="text-xl font-semibold">{occupancy}%</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t("grossRevenue")}</p>
          <p className="text-xl font-semibold">{money(d.grossMinor, d.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t("projectedNet")}</p>
          <p className="text-xl font-semibold">
            {d.projectedNetMinor === null
              ? t("noDraftYet")
              : money(d.projectedNetMinor, d.currency)}
          </p>
        </div>
      </Card>
      <Card className="text-sm">
        <p className="font-medium">{t("nextArrivals")}</p>
        {d.nextArrivals.map((a, i) => (
          <p key={i} className="text-xs">
            {a.arrivalDate} · {a.guestFirstName} · {a.propertyTitle}
          </p>
        ))}
      </Card>
    </div>
  );
}
