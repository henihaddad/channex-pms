import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, DataTable, EmptyState, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { currentSession } from "@/server/session";
import { memberships } from "@/server/auth-flows";
import { loadDashboard, refreshRollupsAction } from "./reports/reports.actions";
import { Kpi, money, pct } from "./reports/kpi";

/** Spec 11 §11.2: one dashboard per persona, every number from the KPI dictionary, freshness on every card. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("dashboard");
  const d = await guard(() => loadDashboard({ propertyId: sp.property ?? null }));
  const session = (await currentSession())!;
  const orgs = await memberships(session.userId);
  const m = d.month.current;
  const cur = d.month.currency;
  const fresh = d.month.freshness
    ? d.month.freshness.slice(0, 16).replace("T", " ")
    : t("noRollup");
  const queue = [
    ["unmapped", d.queue.unmapped, "/reservations/unmapped"],
    ["failedSync", d.queue.failedCells + d.queue.conflictedCells, "/sync-health"],
    ["unassigned", d.queue.unassignedArrivals, "/reservations?view=unassigned"],
    ["breaching", d.queue.breachingMessages, "/inbox?view=breaching_sla"],
    ["unacked", d.queue.unackedRevisions, "/sync-health"],
    ["alerts", d.queue.openAlerts, "/alerts"],
    ["disputes", d.queue.openDisputes, "/owners/statements"],
    ["expiringCards", d.queue.expiringCards, "/reservations?view=payment_action_needed"],
  ] as const;
  const showFinance = d.role === "finance" || d.role === "portfolio" || d.role === "viewer";
  const showOps = d.role !== "viewer";
  const open = queue.filter(([, n]) => n > 0);
  return (
    <div className="flex flex-col gap-5" data-testid="dashboard" data-role={d.role}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm text-muted">{t("welcome", { name: orgs[0]?.name ?? "" })}</h2>
          <PageTitle>{t(`titles.${d.role}`)}</PageTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <Select
              name="property"
              defaultValue={sp.property ?? ""}
              aria-label={t("allProperties")}
              className="w-56"
            >
              <option value="">{t("allProperties")}</option>
              {d.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
          </form>
          <form action={refreshRollupsAction} className="flex items-center gap-2">
            <span className="text-xs text-muted" data-testid="freshness">
              {t("freshness", { at: fresh })}
            </span>
            <Button type="submit" variant="ghost" size="sm" data-testid="refresh-rollups">
              {t("refresh")}
            </Button>
          </form>
        </div>
      </div>

      {showOps ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="today-board">
          <Kpi
            label={t("arrivals")}
            value={String(d.board.arrivals)}
            href="/reservations?view=arrivals_today"
          />
          <Kpi
            label={t("departures")}
            value={String(d.board.departures)}
            href="/reservations?view=departures_today"
          />
          <Kpi
            label={t("inHouse")}
            value={String(d.board.inHouse)}
            href="/reservations?view=in_stay"
          />
          <Kpi
            label={t("occupancyTonight")}
            value={pct(d.board.occupancyTonightBps)}
            hint={d.dictionary.occupancy.formula}
            testId="occupancy-tonight"
          />
        </div>
      ) : null}

      <Card title={t("thisMonth")} description={t("freshness", { at: fresh })}>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          data-testid="month-kpis"
        >
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
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {showOps ? (
          <Card title={t("actionQueue")} data-testid="action-queue">
            {open.length === 0 && d.inbox.needsReply === 0 ? (
              <EmptyState title={t("queueEmpty")} className="py-2" />
            ) : null}
            <ul className="flex flex-col">
              {open.map(([k, n, href]) => (
                <li key={k}>
                  <Link
                    href={href}
                    className="flex items-center justify-between rounded-xl px-2 py-2 text-sm hover:bg-default"
                  >
                    <span>{t(`queue.${k}`)}</span>
                    <Chip color="danger" size="sm">
                      {n}
                    </Chip>
                  </Link>
                </li>
              ))}
              {d.inbox.needsReply > 0 ? (
                <li>
                  <Link
                    href="/inbox"
                    className="flex items-center justify-between rounded-xl px-2 py-2 text-sm hover:bg-default"
                  >
                    <span>{t("queue.needsReply")}</span>
                    <Chip color="accent" size="sm">
                      {d.inbox.needsReply}
                    </Chip>
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>
        ) : null}
        <Card title={t("next7")}>
          <div className="flex items-end gap-1.5" data-testid="next7">
            {d.next7.map((n) => {
              const occ = n.occupancyBps ?? 0;
              const tone =
                n.occupancyBps === null
                  ? "bg-default"
                  : occ < 4000
                    ? "bg-danger/40"
                    : occ < 7000
                      ? "bg-warning/50"
                      : "bg-success/60";
              return (
                <div key={n.date} className="flex flex-1 flex-col items-center gap-1 text-xs">
                  <div className="flex h-20 w-full items-end rounded-lg bg-surface-secondary">
                    <div
                      className={`w-full rounded-lg ${tone}`}
                      style={{ height: `${Math.max(6, occ / 100)}%` }}
                      title={`${n.date}: ${pct(n.occupancyBps)}`}
                    />
                  </div>
                  <span className="text-muted">{n.date.slice(5)}</span>
                  <span className="font-medium tabular-nums">{pct(n.occupancyBps)}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            {t("channelMix")}:{" "}
            {d.month.channels
              .map((c) => `${c.channel} ${pct(c.nightShareBps)}${c.commissionEstimated ? "*" : ""}`)
              .join(" · ") || "—"}
          </p>
        </Card>
        <Card
          title={t("alerts")}
          actions={
            <Link className="text-sm text-accent hover:underline" href="/alerts">
              {t("allAlerts")}
            </Link>
          }
          data-testid="alerts-widget"
        >
          {d.alerts.length === 0 ? <EmptyState title={t("noAlerts")} className="py-2" /> : null}
          <ul className="flex flex-col">
            {d.alerts.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.link}
                  className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm hover:bg-default"
                  data-testid="alert-row"
                >
                  <Chip color={a.severity === "critical" ? "danger" : "warning"} size="sm">
                    {a.severity}
                  </Chip>
                  <span className="min-w-0 flex-1">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {d.role === "portfolio" || d.role === "viewer" || d.role === "finance" ? (
        <Card
          title={t("league")}
          actions={
            <Link
              className="text-sm text-accent hover:underline"
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

      {showOps ? (
        <Card title={t("recentBookings")}>
          {d.board.recentBookings.length === 0 ? (
            <EmptyState title={t("noRecent")} className="py-2" />
          ) : (
            <DataTable
              columns={[
                t("when"),
                t("property"),
                t("channel"),
                t("stay"),
                { label: t("total"), align: "end" },
              ]}
              rows={d.board.recentBookings.map((b) => [
                <Link
                  key="l"
                  href={`/reservations/${b.id}`}
                  className="font-medium hover:underline"
                >
                  {b.createdAt.slice(11, 16)}
                </Link>,
                b.propertyTitle,
                b.channel,
                `${b.arrivalDate} → ${b.departureDate}`,
                money(b.totalMinor, b.currency),
              ])}
              dense
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}
