import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Chip,
  DataTable,
  EmptyState,
  LinkButton,
  PageTitle,
  Select,
  Stat,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { currentOrgId, currentSession } from "@/server/session";
import { consoleContext } from "@/server/console-context";
import { GettingStarted } from "./getting-started";
import { startLabels } from "./start-labels";
import { memberships } from "@/server/auth-flows";
import { loadDashboard, refreshRollupsAction } from "./reports/reports.actions";
import { listReservations } from "./reservations/reservations.actions";
import { Kpi, money, pct } from "./reports/kpi";

/**
 * Today (spec 11 §11.2, design canvas November 2026): the day's numbers, then
 * what needs a person, who arrives, what happened, and the week ahead. The
 * month's KPIs and the league table follow for the people who read them.
 * Numbers a new account cannot have yet stay behind "All metrics".
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("dashboard");
  const tn = await getTranslations("nav");
  const d = await guard(() => loadDashboard({ propertyId: sp.property ?? null }));
  const arrivals = await guard(() => listReservations({ view: "arrivals_today" }));
  const session = (await currentSession())!;
  const orgs = await memberships(session.userId);
  const tob = await getTranslations("onboarding");
  const orgId = await currentOrgId();
  const setup = orgId ? (await consoleContext(orgId)).onboarding : null;
  const m = d.month.current;
  const cur = d.month.currency;
  const fresh = d.month.freshness
    ? d.month.freshness.slice(0, 16).replace("T", " ")
    : t("noRollup");
  const syncIssues = d.queue.failedCells + d.queue.conflictedCells;
  const queue = [
    ["unmapped", d.queue.unmapped, "/reservations/unmapped"],
    ["failedSync", syncIssues, "/sync-health"],
    ["unassigned", d.queue.unassignedArrivals, "/reservations?view=unassigned"],
    ["breaching", d.queue.breachingMessages, "/inbox?view=breaching_sla"],
    ["unacked", d.queue.unackedRevisions, "/sync-health"],
    ["disputes", d.queue.openDisputes, "/owners/statements"],
    ["expiringCards", d.queue.expiringCards, "/reservations?view=payment_action_needed"],
  ] as const;
  const showFinance = d.role === "finance" || d.role === "portfolio" || d.role === "viewer";
  const showOps = d.role !== "viewer";
  const open = queue.filter(([, n]) => n > 0);
  const alerts = d.alerts.slice(0, 5);
  const moreAlerts = d.alerts.length - alerts.length;
  const needs = open.length + (d.inbox.needsReply > 0 ? 1 : 0) + alerts.length;
  const dateLine = new Date(`${d.today}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const activity = [
    ...d.board.recentBookings.map((b) => ({
      at: b.createdAt,
      tone: "accent" as const,
      title: `${t("booked")} · ${b.propertyTitle}`,
      sub: `${b.channel} · ${b.arrivalDate} → ${b.departureDate} · ${money(b.totalMinor, b.currency)}`,
      href: `/reservations/${b.id}`,
    })),
    ...d.alerts.map((a) => ({
      at: a.createdAt,
      tone: a.severity === "critical" ? ("danger" as const) : ("warning" as const),
      title: a.title,
      sub: a.type,
      href: a.link,
    })),
  ]
    .sort((x, y) => (y.at > x.at ? 1 : -1))
    .slice(0, 8);

  const firstRun = setup && setup.some((tr) => !tr.done);

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard" data-role={d.role}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle>{tn("dashboard")}</PageTitle>
          <p className="mt-1.5 text-sm text-muted">
            {dateLine} · {t("welcome", { name: orgs[0]?.name ?? "" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {syncIssues === 0 ? (
            <Chip color="success" size="md">
              {t("inSync")}
            </Chip>
          ) : (
            <Link href="/sync-health">
              <Chip color="warning" size="md">
                {t("syncIssues", { n: syncIssues })}
              </Chip>
            </Link>
          )}
          <form className="flex items-center gap-2">
            <Select
              name="property"
              defaultValue={sp.property ?? ""}
              aria-label={t("allProperties")}
              size="sm"
              className="w-48"
            >
              <option value="">{t("allProperties")}</option>
              {d.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="ghost" size="sm">
              {t("filter")}
            </Button>
          </form>
        </div>
      </div>

      {showOps ? (
        <section
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid="today-board"
          aria-label={t("today")}
        >
          <Link href="/reservations?view=arrivals_today" className="contents">
            <Stat label={t("arrivals")} value={String(d.board.arrivals)} />
          </Link>
          <Link href="/reservations?view=departures_today" className="contents">
            <Stat label={t("departures")} value={String(d.board.departures)} />
          </Link>
          <Stat
            label={t("occupancyTonight")}
            value={pct(d.board.occupancyTonightBps)}
            hint={t("unitsTonight", {
              sold: d.board.roomsSoldTonight,
              total: d.board.roomsAvailable,
            })}
            testId="occupancy-tonight"
          />
          <Stat label={t("revenueToday")} value={money(d.board.revenueTodayMinor, cur)} />
        </section>
      ) : null}

      {firstRun ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <GettingStarted tracks={setup} labels={startLabels(tob)} />
          <div className="flex flex-col gap-5">
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#34d399] to-[#22d3ee] text-sm font-bold text-[#0b1020]">
                  HH
                </span>
                <div>
                  <h2 className="text-base font-bold">{t("person.title")}</h2>
                  <p className="text-xs text-muted">{t("person.lead")}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{t("person.body")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href="/settings/support" size="sm">
                  {t("person.email")}
                </LinkButton>
                <LinkButton href="/settings/support#call" size="sm">
                  {t("person.call")}
                </LinkButton>
              </div>
            </Card>
            <Card title={t("importCard.title")}>
              <p className="text-sm leading-relaxed text-muted">{t("importCard.body")}</p>
              <LinkButton href="/properties/import" variant="primary" className="mt-3 w-full">
                {t("importCard.cta")}
              </LinkButton>
            </Card>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5">
          {showOps ? (
            <Card
              title={t("needsYou")}
              data-testid="action-queue"
              actions={<span className="text-xs text-muted">{t("things", { n: needs })}</span>}
            >
              {needs === 0 ? <EmptyState title={t("queueEmpty")} className="py-2" /> : null}
              <ul className="flex flex-col" data-testid="alerts-widget">
                {d.inbox.needsReply > 0 ? (
                  <NeedRow
                    title={t("queue.needsReply")}
                    sub={String(d.inbox.needsReply)}
                    href="/inbox"
                    cta={t("actions.needsReply")}
                  />
                ) : null}
                {open.map(([k, n, href]) => (
                  <NeedRow
                    key={k}
                    title={t(`queue.${k}`)}
                    sub={String(n)}
                    href={href}
                    cta={t(`actions.${k}`)}
                  />
                ))}
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.link}
                      className="flex items-center gap-3 border-b border-border/70 py-3 text-sm last:border-b-0 hover:bg-surface-secondary/60"
                      data-testid="alert-row"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${a.severity === "critical" ? "bg-danger" : "bg-warning"}`}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                    </Link>
                  </li>
                ))}
                {moreAlerts > 0 ? (
                  <li>
                    <Link
                      href="/alerts"
                      className="block py-2 text-sm text-muted hover:text-foreground"
                    >
                      {t("moreAlerts", { n: moreAlerts })}
                    </Link>
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          {showOps ? (
            <Card title={t("arrivingToday")}>
              {arrivals.rows.length === 0 ? (
                <EmptyState title={t("noArrivalsToday")} className="py-1" />
              ) : (
                <ul className="flex flex-col">
                  {arrivals.rows.slice(0, 8).map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 border-b border-border/70 py-3 text-sm last:border-b-0"
                    >
                      <span className="min-w-0">
                        <Link
                          href={`/reservations/${r.id}`}
                          className="font-semibold hover:underline"
                        >
                          {r.guestName}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {r.propertyTitle} · {r.otaName ?? "Direct"} · {r.nights} {t("nights")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {r.mappingState !== "mapped" || r.unassignedRooms > 0 ? (
                          <Chip color="warning" size="sm">
                            {t("needsRoomChip")}
                          </Chip>
                        ) : null}
                        {r.balanceMinor > 0 ? (
                          <Chip color="warning" size="sm">
                            {t("balanceDue", { amount: money(r.balanceMinor, r.currency) })}
                          </Chip>
                        ) : (
                          <Chip color="success" size="sm">
                            {t("paid")}
                          </Chip>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Card
            title={t("activity")}
            actions={
              <Link href="/alerts" className="text-xs font-semibold text-accent hover:underline">
                {t("allActivity")}
              </Link>
            }
          >
            {activity.length === 0 ? (
              <p className="text-sm text-muted">{t("nothingYet")}</p>
            ) : (
              <ul className="flex flex-col">
                {activity.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 border-b border-border/70 py-2.5 text-sm last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        a.tone === "danger"
                          ? "bg-danger"
                          : a.tone === "warning"
                            ? "bg-warning"
                            : "bg-accent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <Link href={a.href} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                      <span className="block truncate text-xs text-muted">{a.sub}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {a.at.slice(11, 16) || a.at.slice(5, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("next7")}>
            <div className="flex items-end gap-1.5" data-testid="next7">
              {d.next7.map((n) => {
                const occ = n.occupancyBps ?? 0;
                const tone =
                  n.occupancyBps === null
                    ? "bg-default"
                    : occ < 4000
                      ? "bg-accent-soft"
                      : occ < 7000
                        ? "bg-accent/60"
                        : "bg-accent";
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
                    <span className="font-semibold tabular-nums">{pct(n.occupancyBps)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              {t("channelMix")}:{" "}
              {d.month.channels
                .map(
                  (c) => `${c.channel} ${pct(c.nightShareBps)}${c.commissionEstimated ? "*" : ""}`,
                )
                .join(" · ") || "—"}
            </p>
          </Card>
        </div>
      </div>

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
    </div>
  );
}

function NeedRow({
  title,
  sub,
  href,
  cta,
}: {
  title: string;
  sub: string;
  href: string;
  cta: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/70 py-3 last:border-b-0">
      <span className="min-w-0 text-sm">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <LinkButton href={href} size="sm" className="shrink-0">
        {cta}
      </LinkButton>
    </li>
  );
}
