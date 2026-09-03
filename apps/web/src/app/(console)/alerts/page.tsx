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
            className={`rounded px-2 py-1 ${(sp.state ?? "open") === s ? "bg-default font-semibold" : "hover:bg-background"}`}
          >
            {t(`states.${s}`)}
          </Link>
        ))}
      </div>
      <Card>
        {v.rows.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        {v.rows.map((a) => (
          <div
            key={a.id}
            className="flex items-start justify-between gap-2 border-t border-border py-2 text-sm"
            data-testid="alert-item"
            data-type={a.type}
            data-state={a.state}
          >
            <div>
              <p>
                <span
                  className={`me-1 rounded px-1 text-xs ${a.severity === "critical" ? "bg-danger-soft text-danger" : a.severity === "warning" ? "bg-warning-soft text-warning-soft-foreground" : "bg-background"}`}
                >
                  {a.severity}
                </span>
                <Link className="underline" href={a.link}>
                  {a.title}
                </Link>
                <span className="ms-2 text-xs text-muted">
                  {a.raisedOn} · {a.type}
                  {noisy.has(a.type as AlertType) ? ` · ${t("noisy")}` : ""}
                </span>
              </p>
              <p className="text-xs text-muted">{a.detail}</p>
            </div>
            {a.state === "open" || a.state === "acknowledged" ? (
              <div className="flex gap-1">
                {a.state === "open" ? (
                  <form action={alertStateAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="state" value="acknowledged" />
                    <Button type="submit" variant="secondary" data-testid="ack-alert" size="sm">
                      {t("acknowledge")}
                    </Button>
                  </form>
                ) : null}
                <form action={alertStateAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="state" value="actioned" />
                  <Button type="submit" data-testid="action-alert" size="sm">
                    {t("actioned")}
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
      </Card>
      <Card className="text-xs" title={t("actionRates")}>
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
