import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
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
  return (
    <div className="space-y-4" data-testid="dashboard" data-role={d.role}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm text-muted">{t("welcome", { name: orgs[0]?.name ?? "" })}</h2>
          <PageTitle>{t(`titles.${d.role}`)}</PageTitle>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <form className="flex items-center gap-1">
            <select
              name="property"
              defaultValue={sp.property ?? ""}
              className="h-7 rounded border border-line-strong px-1"
            >
              <option value="">{t("allProperties")}</option>
              {d.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" className="h-7 text-xs">
              {t("filter")}
            </Button>
          </form>
          <span data-testid="freshness">{t("freshness", { at: fresh })}</span>
          <form action={refreshRollupsAction}>
            <Button
              type="submit"
              variant="secondary"
              className="h-7 text-xs"
              data-testid="refresh-rollups"
            >
              {t("refresh")}
            </Button>
          </form>
        </div>
      </div>

      {showOps ? (
        <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="today-board">
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
        </Card>
      ) : null}

      <Card
        className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-6"
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
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {showOps ? (
          <Card className="text-sm" data-testid="action-queue">
            <p className="mb-1 font-medium">{t("actionQueue")}</p>
            {queue.filter(([, n]) => n > 0).length === 0 ? (
              <p className="text-xs text-muted">{t("queueEmpty")}</p>
            ) : null}
            {queue
              .filter(([, n]) => n > 0)
              .map(([k, n, href]) => (
                <Link
                  key={k}
                  href={href}
                  className="flex justify-between border-t border-line py-1 text-xs hover:bg-canvas"
                >
                  <span>{t(`queue.${k}`)}</span>
                  <span className="rounded bg-rose-soft px-1.5 text-rose">{n}</span>
                </Link>
              ))}
            {d.inbox.needsReply > 0 ? (
              <Link
                href="/inbox"
                className="flex justify-between border-t border-line py-1 text-xs hover:bg-canvas"
              >
                <span>{t("queue.needsReply")}</span>
                <span className="rounded bg-sky-soft px-1.5 text-sky-deep">
                  {d.inbox.needsReply}
                </span>
              </Link>
            ) : null}
          </Card>
        ) : null}
        <Card className="text-sm">
          <p className="mb-1 font-medium">{t("next7")}</p>
          <div className="flex gap-1" data-testid="next7">
            {d.next7.map((n) => (
              <div key={n.date} className="flex-1 text-center text-[10px]">
                <div
                  className={`mx-auto h-16 w-full rounded ${n.occupancyBps === null ? "bg-canvas" : (n.occupancyBps ?? 0) < 4000 ? "bg-rose/30" : (n.occupancyBps ?? 0) < 7000 ? "bg-amber/40" : "bg-mint/50"}`}
                  style={{ opacity: 0.4 + ((n.occupancyBps ?? 0) / 10000) * 0.6 }}
                  title={`${n.date}: ${pct(n.occupancyBps)}`}
                />
                <div>{n.date.slice(5)}</div>
                <div>{pct(n.occupancyBps)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("channelMix")}:{" "}
            {d.month.channels
              .map((c) => `${c.channel} ${pct(c.nightShareBps)}${c.commissionEstimated ? "*" : ""}`)
              .join(" · ") || "—"}
          </p>
        </Card>
        <Card className="text-sm" data-testid="alerts-widget">
          <p className="mb-1 font-medium">
            <Link className="underline" href="/alerts">
              {t("alerts")}
            </Link>
          </p>
          {d.alerts.length === 0 ? <p className="text-xs text-muted">{t("noAlerts")}</p> : null}
          {d.alerts.map((a) => (
            <Link
              key={a.id}
              href={a.link}
              className="block border-t border-line py-1 text-xs hover:bg-canvas"
              data-testid="alert-row"
            >
              <span
                className={`me-1 rounded px-1 ${a.severity === "critical" ? "bg-rose-soft text-rose" : "bg-amber-soft text-amber-deep"}`}
              >
                {a.severity}
              </span>
              {a.title}
            </Link>
          ))}
        </Card>
      </div>

      {d.role === "portfolio" || d.role === "viewer" || d.role === "finance" ? (
        <Card>
          <p className="mb-1 text-sm font-medium">{t("league")}</p>
          <table className="w-full text-xs" data-testid="league-table">
            <thead className="text-muted">
              <tr>
                <th className="text-start">{t("property")}</th>
                <th className="text-end">{d.dictionary.occupancy.name}</th>
                <th className="text-end">{d.dictionary.adr.name}</th>
                <th className="text-end">{d.dictionary.revpar.name}</th>
                <th className="text-end">{t("revenueMtd")}</th>
                <th className="text-end">{t("budget")}</th>
              </tr>
            </thead>
            <tbody>
              {d.league.map((p) => (
                <tr
                  key={p.propertyId}
                  className="border-t border-line"
                  data-testid="league-row"
                  data-outlier={p.outlier ? "1" : "0"}
                >
                  <td className="py-0.5">
                    <Link className="underline" href={`/?property=${p.propertyId}`}>
                      {p.title}
                    </Link>
                    {p.outlier ? (
                      <span className="ms-1 rounded bg-rose-soft px-1 text-rose">
                        {t("outlier")}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-end tabular-nums">{pct(p.kpi.occupancyBps)}</td>
                  <td className="text-end tabular-nums">{money(p.kpi.adrMinor, p.currency)}</td>
                  <td className="text-end tabular-nums">{money(p.kpi.revparMinor, p.currency)}</td>
                  <td className="text-end tabular-nums">
                    {money(p.kpi.roomRevenueMinor, p.currency)}
                  </td>
                  <td className="text-end tabular-nums text-muted">
                    {p.budgetRoomRevenueMinor === null
                      ? "—"
                      : money(p.budgetRoomRevenueMinor, p.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs">
            <Link
              className="underline"
              href={`/api/v1/reports/kpi_summary.csv?from=${d.month.period.from}&to=${d.month.period.to}`}
            >
              {t("exportCsv")}
            </Link>
          </p>
        </Card>
      ) : null}

      {showOps ? (
        <Card className="text-sm">
          <p className="mb-1 font-medium">{t("recentBookings")}</p>
          {d.board.recentBookings.length === 0 ? (
            <p className="text-xs text-muted">{t("noRecent")}</p>
          ) : null}
          {d.board.recentBookings.map((b) => (
            <Link
              key={b.id}
              href={`/reservations/${b.id}`}
              className="block border-t border-line py-1 text-xs hover:bg-canvas"
            >
              {b.createdAt.slice(11, 16)} · {b.propertyTitle} · {b.channel} · {b.arrivalDate} →{" "}
              {b.departureDate} · {money(b.totalMinor, b.currency)}
            </Link>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
