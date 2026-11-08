import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, DataTable } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadDashboard, refreshRollupsAction } from "./reports.actions";
import { Kpi, money, pct } from "./kpi";

/**
 * This month's KPIs and the property league table (spec 11 §11.2). They lived on Today; the
 * design canvas keeps Today to the day and puts occupancy, ADR and RevPAR on Reports.
 */
export async function MonthOverview({ propertyId }: { propertyId: string | null }) {
  const t = await getTranslations("dashboard");
  const d = await guard(() => loadDashboard({ propertyId }));
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
            <Button type="submit" variant="ghost" size="sm" data-testid="refresh-rollups">
              {t("refresh")}
            </Button>
          </form>
        }
      >
        <span className="sr-only" data-testid="freshness">
          {t("freshness", { at: fresh })}
        </span>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="month-kpis">
          <Kpi
            label={d.dictionary.occupancy.name}
            value={pct(m.occupancyBps)}
            delta={d.month.previous.occupancyBps}
            current={m.occupancyBps}
            hint={d.dictionary.occupancy.formula}
            testId="occupancy-mtd"
          />
          <Kpi
            label={d.dictionary.adr.name}
            value={money(m.adrMinor, cur)}
            delta={d.month.previous.adrMinor}
            current={m.adrMinor}
            hint={d.dictionary.adr.formula}
            testId="adr-mtd"
          />
          <Kpi
            label={d.dictionary.revpar.name}
            value={money(m.revparMinor, cur)}
            delta={d.month.previous.revparMinor}
            current={m.revparMinor}
            hint={d.dictionary.revpar.formula}
            testId="revpar-mtd"
          />
          <Kpi
            label={t("revenueMtd")}
            value={money(m.roomRevenueMinor, cur)}
            delta={d.month.previous.roomRevenueMinor}
            current={m.roomRevenueMinor}
            hint={d.dictionary.rooms_sold.formula}
          />
        </div>
        <details className="group mt-3">
          <summary className="cursor-pointer text-sm text-muted select-none hover:text-foreground">
            {t("allMetrics")}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi
              label={d.dictionary.direct_share.name}
              value={pct(m.directShareBps)}
              hint={d.dictionary.direct_share.formula}
            />
            <Kpi
              label={d.dictionary.pickup.name}
              value={`${String(d.month.pickup7.nights)} ${t("nights")}`}
              hint={d.dictionary.pickup.formula}
            />
            {showFinance ? (
              <>
                <Kpi
                  label={d.dictionary.net_adr.name}
                  value={money(m.netAdrMinor, cur)}
                  hint={d.dictionary.net_adr.formula}
                />
                <Kpi
                  label={d.dictionary.commission_cost.name}
                  value={money(m.commissionMinor, cur)}
                  hint={d.dictionary.commission_cost.formula}
                />
                <Kpi
                  label={d.dictionary.trevpar.name}
                  value={money(m.trevparMinor, cur)}
                  hint={d.dictionary.trevpar.formula}
                />
              </>
            ) : null}
            <Kpi
              label={d.dictionary.cancellation_rate.name}
              value={pct(m.cancellationRateBps)}
              hint={d.dictionary.cancellation_rate.formula}
            />
            <Kpi
              label={d.dictionary.alos.name}
              value={d.month.alos === null ? "—" : `${String(d.month.alos)} ${t("nights")}`}
              hint={d.dictionary.alos.formula}
            />
            <Kpi
              label={d.dictionary.pace.name}
              value={d.month.pace.available ? pct(d.month.pace.deltaBps) : t("paceUnavailable")}
              hint={`${d.dictionary.pace.formula}${d.month.pace.available ? "" : ` · ${d.month.pace.reason ?? ""}`}`}
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
              { label: d.dictionary.occupancy.name, align: "end" },
              { label: d.dictionary.adr.name, align: "end" },
              { label: d.dictionary.revpar.name, align: "end" },
              { label: t("revenueMtd"), align: "end" },
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
