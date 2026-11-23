import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { noisyTypes, type AlertType } from "@pms/core";
import { Card, EmptyState, PageHeader, SubmitButton, cn } from "@/components/ui";
import { guard } from "@/server/guard";
import { day } from "@/lib/format";
import { alertStateAction, listAlerts } from "../reports/reports.actions";

export async function generateMetadata() {
  const t = await getTranslations("alertsPage");
  return { title: t("title") };
}

const STATES = ["open", "acknowledged", "actioned", "resolved"] as const;

/**
 * Alerts (spec 11 §11.4): actionable, linked to the drill-down, with the action rate per type.
 * Persona: the property manager who wants to hear about a problem before a guest does.
 */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("alertsPage");
  const locale = await getLocale();
  const current = STATES.find((s) => s === sp.state) ?? "open";
  const v = await guard(() => listAlerts({ state: current }));
  const noisy = new Set(noisyTypes(v.stats.map((s) => ({ ...s, type: s.type as AlertType }))));
  const type = (k: string) => (t.has(`types.${k}`) ? t(`types.${k}`) : k.replace(/_/g, " "));
  const severity = (k: string) => (t.has(`severity.${k}`) ? t(`severity.${k}`) : k);
  const raised = (iso: string) =>
    /^\d{4}-\d{2}-\d{2}/.test(iso) ? day(iso.slice(0, 10), locale) : iso;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("lead")} />
      <nav aria-label={t("filter")} className="flex flex-wrap gap-2 text-sm">
        {STATES.map((s) => (
          <Link
            key={s}
            href={`/alerts?state=${s}`}
            aria-current={current === s ? "page" : undefined}
            className={cn(
              "inline-flex min-h-8 items-center rounded-full px-3 pointer-coarse:min-h-11",
              current === s ? "bg-default font-semibold" : "hover:bg-background",
            )}
          >
            {t(`states.${s}`)}
          </Link>
        ))}
      </nav>
      <Card>
        {v.rows.length === 0 ? (
          <EmptyState
            title={
              current === "open" ? t("empty") : t("emptyState", { state: t(`states.${current}`) })
            }
          />
        ) : null}
        {v.rows.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-start justify-between gap-2 border-t border-border py-3 text-sm first:border-t-0"
            data-testid="alert-item"
            data-type={a.type}
            data-state={a.state}
          >
            <div>
              <p>
                <span
                  className={`me-1 rounded px-1 text-xs ${a.severity === "critical" ? "bg-danger-soft text-danger" : a.severity === "warning" ? "bg-warning-soft text-warning-soft-foreground" : "bg-background"}`}
                >
                  {severity(a.severity)}
                </span>
                <Link className="underline" href={a.link}>
                  {a.title}
                </Link>
                <span className="ms-2 text-xs text-muted">
                  {raised(a.raisedOn)} · {type(a.type)}
                  {noisy.has(a.type as AlertType) ? ` · ${t("noisy")}` : ""}
                </span>
              </p>
              <p className="text-xs text-muted">{a.detail}</p>
            </div>
            {a.state === "open" || a.state === "acknowledged" ? (
              <div className="flex gap-2">
                {a.state === "open" ? (
                  <form action={alertStateAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="state" value="acknowledged" />
                    <SubmitButton
                      variant="secondary"
                      testId="ack-alert"
                      size="sm"
                      aria-label={t("acknowledgeLabel", { title: a.title })}
                    >
                      {t("acknowledge")}
                    </SubmitButton>
                  </form>
                ) : null}
                <form action={alertStateAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="state" value="actioned" />
                  <SubmitButton
                    testId="action-alert"
                    size="sm"
                    aria-label={t("actionedLabel", { title: a.title })}
                  >
                    {t("actioned")}
                  </SubmitButton>
                </form>
              </div>
            ) : null}
          </div>
        ))}
      </Card>
      {v.stats.length > 0 ? (
        <Card className="text-xs" title={t("actionRates")}>
          <ul className="flex flex-col gap-1">
            {v.stats.map((s) => (
              <li key={s.type}>
                {t("actionRate", { type: type(s.type), actioned: s.actioned, raised: s.raised })}
                {noisy.has(s.type as AlertType) ? ` · ${t("noisy")}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
