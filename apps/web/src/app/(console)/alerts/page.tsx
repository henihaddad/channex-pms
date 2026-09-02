import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { noisyTypes, type AlertType } from "@pms/core";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { alertStateAction, listAlerts } from "../reports/reports.actions";

/** Alerts (spec 11 §11.4): actionable, linked to the drill-down, with the action rate per type (ALRT-1). */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("alertsPage");
  const v = await guard(() => listAlerts({ state: sp.state ?? "open" }));
  const noisy = new Set(noisyTypes(v.stats.map((s) => ({ ...s, type: s.type as AlertType }))));
  return (
    <div className="space-y-4">
      <PageTitle>{t("title")}</PageTitle>
      <div className="flex gap-2 text-xs">
        {["open", "acknowledged", "actioned", "resolved"].map((s) => (
          <Link
            key={s}
            href={`/alerts?state=${s}`}
            className={`rounded px-2 py-1 ${(sp.state ?? "open") === s ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}`}
          >
            {t(`states.${s}`)}
          </Link>
        ))}
      </div>
      <Card>
        {v.rows.length === 0 ? <p className="text-sm text-slate-500">{t("empty")}</p> : null}
        {v.rows.map((a) => (
          <div
            key={a.id}
            className="flex items-start justify-between gap-2 border-t border-slate-100 py-2 text-sm"
            data-testid="alert-item"
            data-type={a.type}
            data-state={a.state}
          >
            <div>
              <p>
                <span
                  className={`me-1 rounded px-1 text-xs ${a.severity === "critical" ? "bg-rose-100 text-rose-800" : a.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}
                >
                  {a.severity}
                </span>
                <Link className="underline" href={a.link}>
                  {a.title}
                </Link>
                <span className="ms-2 text-xs text-slate-500">
                  {a.raisedOn} · {a.type}
                  {noisy.has(a.type as AlertType) ? ` · ${t("noisy")}` : ""}
                </span>
              </p>
              <p className="text-xs text-slate-600">{a.detail}</p>
            </div>
            {a.state === "open" || a.state === "acknowledged" ? (
              <div className="flex gap-1">
                {a.state === "open" ? (
                  <form action={alertStateAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="state" value="acknowledged" />
                    <Button
                      type="submit"
                      variant="secondary"
                      className="h-7 text-xs"
                      data-testid="ack-alert"
                    >
                      {t("acknowledge")}
                    </Button>
                  </form>
                ) : null}
                <form action={alertStateAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="state" value="actioned" />
                  <Button type="submit" className="h-7 text-xs" data-testid="action-alert">
                    {t("actioned")}
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
      </Card>
      <Card className="text-xs">
        <p className="font-medium">{t("actionRates")}</p>
        {v.stats.map((s) => (
          <p key={s.type}>
            {s.type}: {s.actioned}/{s.raised} {t("actionedOf")}
            {noisy.has(s.type as AlertType) ? ` · ${t("noisy")}` : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}
