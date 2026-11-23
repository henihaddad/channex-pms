import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Chip, DataTable, SubmitButton } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadDashboard, refreshRollupsAction } from "./reports.actions";
import { money as fmtMoney } from "@/lib/format";
import { Kpi, pct } from "./kpi";

/**
 * This month's KPIs and the property league table (spec 11 §11.2). They lived on Today; the
 * design canvas keeps Today to the day and puts occupancy, ADR and RevPAR on Reports.
 */
export async function MonthOverview({ propertyId }: { propertyId: string | null }) {
  const t = await getTranslations("dashboard");
  const tr = await getTranslations("reports");
  const locale = await getLocale();
  const d = await guard(() => loadDashboard({ propertyId }));
  const money = (minor: number | null, currency: string) => fmtMoney(minor, currency, locale);
  // plain words on the tile, the formula in the tooltip; the acronym stays in the formula
  const name = (k: string) => tr(`metric.${k}`);
  const how = (k: string) => tr(`metricHint.${k}`);
  const vs = (change: string) => tr("vsPrevious", { pct: change });
  const m = d.month.current;
  const cur = d.month.currency;
  const fresh = d.month.freshness
    ? d.month.freshness.slice(0, 16).replace("T", " ")
    : t("noRollup");
  const showFinance = d.role === "finance" || d.role === "portfolio" || d.role === "viewer";
  return (
    <>
      <Card
        title={t("thisMonth")}
        description={t("freshness", { at: fresh })}
        actions={
          <form action={refreshRollupsAction}>
            <SubmitButton variant="ghost" size="sm" testId="refresh-rollups">
              {t("refresh")}
            </SubmitButton>
          </form>
        }
      >
        <span className="sr-only" data-testid="freshness">
          {t("freshness", { at: fresh })}
        </span>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="month-kpis">
          <Kpi
            vs={vs}
            label={name("occupancy")}
            value={pct(m.occupancyBps)}
            delta={d.month.previous.occupancyBps}
            current={m.occupancyBps}
            hint={how("occupancy")}
            testId="occupancy-mtd"
          />
          <Kpi
            vs={vs}
            label={name("adr")}
            value={money(m.adrMinor, cur)}
            delta={d.month.previous.adrMinor}
            current={m.adrMinor}
            hint={how("adr")}
            testId="adr-mtd"
          />
          <Kpi
            vs={vs}
            label={name("revpar")}
            value={money(m.revparMinor, cur)}
            delta={d.month.previous.revparMinor}
            current={m.revparMinor}
            hint={how("revpar")}
            testId="revpar-mtd"
          />
          <Kpi
            vs={vs}
            label={name("revenueMtd")}
            value={money(m.roomRevenueMinor, cur)}
            delta={d.month.previous.roomRevenueMinor}
            current={m.roomRevenueMinor}
            hint={how("revenueMtd")}
          />
        </div>
        <details className="group mt-3">
          <summary className="cursor-pointer text-sm text-muted select-none hover:text-foreground">
            {t("allMetrics")}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi
              vs={vs}
              label={name("direct_share")}
              value={pct(m.directShareBps)}
              hint={how("direct_share")}
            />
            <Kpi
              vs={vs}
              label={name("pickup")}
              value={`${String(d.month.pickup7.nights)} ${t("nights")}`}
              hint={how("pickup")}
            />
            {showFinance ? (
              <>
                <Kpi
                  vs={vs}
                  label={name("net_adr")}
                  value={money(m.netAdrMinor, cur)}
                  hint={how("net_adr")}
                />
                <Kpi
                  vs={vs}
                  label={name("commission_cost")}
                  value={money(m.commissionMinor, cur)}
                  hint={how("commission_cost")}
                />
                <Kpi
                  vs={vs}
                  label={name("trevpar")}
                  value={money(m.trevparMinor, cur)}
                  hint={how("trevpar")}
                />
              </>
            ) : null}
            <Kpi
              vs={vs}
              label={name("cancellation_rate")}
              value={pct(m.cancellationRateBps)}
              hint={how("cancellation_rate")}
            />
            <Kpi
              vs={vs}
              label={name("alos")}
              value={d.month.alos === null ? "—" : `${String(d.month.alos)} ${t("nights")}`}
              hint={how("alos")}
            />
            <Kpi
              vs={vs}
              label={name("pace")}
              value={d.month.pace.available ? pct(d.month.pace.deltaBps) : t("paceUnavailable")}
              hint={how("pace")}
              testId="pace"
            />
          </div>
        </details>
      </Card>

      {d.role === "portfolio" || d.role === "viewer" || d.role === "finance" ? (
        <Card
          title={t("league")}
          actions={
            <Link
              className="text-xs font-semibold text-accent hover:underline"
              href={`/api/v1/reports/kpi_summary.csv?from=${d.month.period.from}&to=${d.month.period.to}`}
            >
              {t("exportCsv")}
            </Link>
          }
        >
          <DataTable
            testId="league-table"
            rowTestId="league-row"
            columns={[
              t("property"),
              { label: name("occupancy"), align: "end" },
              { label: name("adr"), align: "end" },
              { label: name("revpar"), align: "end" },
              { label: name("revenueMtd"), align: "end" },
              { label: t("budget"), align: "end" },
            ]}
            rowKey={(_, i) => d.league[i]!.propertyId}
            rows={d.league.map((p) => [
              <span
                key="t"
                className="inline-flex items-center gap-2"
                data-outlier={p.outlier ? "1" : "0"}
              >
                <Link className="font-medium hover:underline" href={`/?property=${p.propertyId}`}>
                  {p.title}
                </Link>
                {p.outlier ? (
                  <Chip color="danger" size="sm">
                    {t("outlier")}
                  </Chip>
                ) : null}
              </span>,
              pct(p.kpi.occupancyBps),
              money(p.kpi.adrMinor, p.currency),
              money(p.kpi.revparMinor, p.currency),
              money(p.kpi.roomRevenueMinor, p.currency),
              p.budgetRoomRevenueMinor === null ? "—" : money(p.budgetRoomRevenueMinor, p.currency),
            ])}
            dense
          />
        </Card>
      ) : null}
    </>
  );
}
