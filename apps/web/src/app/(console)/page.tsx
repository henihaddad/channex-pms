import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Chip, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { guard } from "@/server/guard";
import { currentOrgId, currentSession } from "@/server/session";
import { consoleContext } from "@/server/console-context";
import { currentUserProfile, memberships } from "@/server/auth-flows";
import { channelLabel, day as dayLabel, dayMonth, elapsed, money, percent } from "@/lib/format";
import { FirstRun } from "./first-run";
import { startLabels } from "./start-labels";
import { loadDashboard } from "./reports/reports.actions";
import { listReservations } from "./reservations/reservations.actions";

const channelName = (c: string | null | undefined): string => channelLabel(c);

/**
 * Today (spec 11 §11.2, design canvas November 2026): the day's four numbers, then what needs a
 * person (each row says which booking or owner and has the button that clears it), who arrives
 * and what is still open for them, what happened, and the week ahead. Before the first property
 * is live the page is the first-run checklist instead. The month's KPIs live on Reports.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("dashboard");
  const tt = await getTranslations("dashboard.t");
  const tn = await getTranslations("nav");
  const locale = await getLocale();
  const d = await guard(() => loadDashboard({ propertyId: sp.property ?? null }));
  const session = (await currentSession())!;
  const orgId = await currentOrgId();
  const [orgs, me, cx] = await Promise.all([
    memberships(session.userId),
    currentUserProfile(session.userId),
    orgId ? consoleContext(orgId) : Promise.resolve(null),
  ]);
  const org = orgs.find((o) => o.orgId === orgId) ?? orgs[0];
  const setup = cx?.onboarding ?? null;
  const connect = setup?.find((tr) => tr.key === "connect");
  const firstRun = Boolean(connect && !connect.done) && !d.details.anyBooking;
  const firstName = (me?.name ?? "").trim().split(/\s+/)[0] ?? "";

  const dateLine = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${d.today}T12:00:00Z`));
  const place = d.details.city ?? org?.name ?? "";

  const header = (
    <PageHeader title={tn("dashboard")} titleOnPhone={false}>
      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {tt("dateLine", { date: dateLine, place })}
          <span className="sr-only">{t("welcome", { name: org?.name ?? "" })}</span>
        </p>
        <SyncPill
          issues={d.queue.failedCells + d.queue.conflictedCells}
          issuesText={tt("need.failedSync", { n: d.queue.failedCells + d.queue.conflictedCells })}
          okText={
            d.details.lastSyncAt
              ? tt("syncedAgo", { ago: elapsed(d.details.lastSyncAt) })
              : tt("noChannel")
          }
        />
      </div>
    </PageHeader>
  );

  if (firstRun && setup) {
    const tob = await getTranslations("onboarding");
    const L = startLabels(tob);
    return (
      <div className="flex flex-col gap-5" data-testid="dashboard" data-role={d.role}>
        {header}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <FirstRun
            tracks={setup}
            labels={{
              title: tt("first.title", { name: firstName }),
              lead: tt("first.lead"),
              of: (done, total) => tt("first.of", { done, total }),
              orgCreated: tt("first.orgCreated"),
              minutes: (n) => tt("first.minutes", { n }),
              start: tt("first.start"),
              done: tt("first.done"),
              locked: tt("first.locked"),
              tracks: L.tracks,
              steps: L.steps,
              waiting: L.waiting,
              call: tt("first.call"),
              guide: tt("first.guide"),
              help: tt("first.help"),
              previewTitle: tt("first.previewTitle"),
              previewBody: tt("first.previewBody"),
              addProperty: tt("first.addProperty"),
            }}
          />
          <div className="flex flex-col gap-5">
            <Card title={tt("first.getTitle")}>
              <ul className="flex flex-col gap-2 text-sm">
                {(["get1", "get2", "get3", "get4"] as const).map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-success" aria-hidden="true">
                      ✓
                    </span>
                    {tt(`first.${k}`)}
                  </li>
                ))}
              </ul>
            </Card>
            <PersonCard
              L={{
                title: t("person.title"),
                byline: tt("first.byline"),
                body: t("person.body"),
                email: t("person.email"),
                whatsapp: tt("first.whatsapp"),
                call: t("person.call"),
              }}
            />
            <Card title={t("importCard.title")}>
              <p className="text-sm leading-relaxed text-muted">{t("importCard.body")}</p>
              <LinkButton href="/properties/import" variant="primary" className="mt-3 w-full">
                {t("importCard.cta")}
              </LinkButton>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const arrivals = await guard(() => listReservations({ view: "arrivals_today", limit: 8 }));
  const since = shiftDays(d.today, -1);
  const [booked, modified] = await Promise.all([
    guard(() => listReservations({ dateType: "booked", from: since, limit: 12 })),
    guard(() => listReservations({ view: "modified_since_yesterday", limit: 12 })),
  ]);
  const recent = {
    rows: [...new Map([...booked.rows, ...modified.rows].map((r) => [r.id, r])).values()],
  };
  const cur = d.month.currency;
  const det = d.details;
  const syncIssues = d.queue.failedCells + d.queue.conflictedCells;
  const showOps = d.role !== "viewer";

  // the four numbers, each with the line that says what is behind it
  const weekdayLastWeek = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${d.today}T12:00:00Z`));
  const revDelta =
    det.revenueSameDayLastWeekMinor > 0
      ? Math.round(
          ((d.board.revenueTodayMinor - det.revenueSameDayLastWeekMinor) /
            det.revenueSameDayLastWeekMinor) *
            100,
        )
      : null;

  // Needs you: one row per thing, saying which booking, owner or property it means
  type Need = {
    key: string;
    title: string;
    sub: string;
    href: string;
    cta: string;
    alert?: boolean;
  };
  const needs: Need[] = [];
  const q = d.queue;
  if (q.unmapped > 0 && det.unmapped)
    needs.push({
      key: "unmapped",
      title: tt("need.unmapped", { channel: channelName(det.unmapped.channel) }),
      sub: tt("need.unmappedSub", {
        property: det.unmapped.propertyTitle,
        day: dayLabel(det.unmapped.arrivalDate, locale),
        nights: det.unmapped.nights,
      }),
      href: "/reservations/unmapped",
      cta: tt("need.cta.unmapped"),
    });
  if (d.inbox.breaching > 0)
    needs.push({
      key: "breaching",
      title: tt("need.breaching", { n: d.inbox.breaching }),
      sub: det.oldestBreachingSince
        ? tt("need.breachingSub", { ago: elapsed(det.oldestBreachingSince) })
        : "",
      href: "/inbox?view=breaching_sla",
      cta: tt("need.cta.breaching"),
    });
  else if (d.inbox.needsReply > 0)
    needs.push({
      key: "needsReply",
      title: tt("need.needsReply", { n: d.inbox.needsReply }),
      sub: tt("need.needsReplySub"),
      href: "/inbox",
      cta: tt("need.cta.needsReply"),
    });
  if (det.changeoverNoCleaner.count > 0)
    needs.push({
      key: "changeover",
      title:
        det.changeoverNoCleaner.count === 1
          ? tt("need.changeover")
          : tt("need.changeoverMore", { n: det.changeoverNoCleaner.count }),
      sub: det.changeoverNoCleaner.first
        ? tt("need.changeoverSub", {
            property: det.changeoverNoCleaner.first.propertyTitle,
            from: det.changeoverNoCleaner.first.from,
            to: det.changeoverNoCleaner.first.to,
          })
        : "",
      href: "/operations",
      cta: tt("need.cta.changeover"),
    });
  if (q.unassignedArrivals > 0 && det.unassigned)
    needs.push({
      key: "unassigned",
      title: tt("need.unassigned", { n: q.unassignedArrivals }),
      sub: tt("need.unmappedSub", {
        property: det.unassigned.propertyTitle,
        day: dayLabel(det.unassigned.arrivalDate, locale),
        nights: det.unassigned.nights,
      }),
      href: "/reservations?view=unassigned",
      cta: tt("need.cta.unassigned"),
    });
  if (det.failedPayouts.count > 0 && det.failedPayouts.first)
    needs.push({
      key: "payout",
      title:
        det.failedPayouts.count === 1
          ? tt("need.payout", { owner: det.failedPayouts.first.ownerName })
          : tt("need.payoutMore", { n: det.failedPayouts.count }),
      sub: tt("need.payoutSub", {
        amount: money(det.failedPayouts.first.amountMinor, det.failedPayouts.first.currency),
        reason: det.failedPayouts.first.reason ?? tt("need.payoutNoReason"),
      }),
      href: "/owners/payouts",
      cta: tt("need.cta.payout"),
    });
  if (det.statementsToReview.count > 0 && det.statementsToReview.first) {
    const st = det.statementsToReview.first;
    const period = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${st.periodFrom}T12:00:00Z`));
    needs.push({
      key: "statement",
      title:
        det.statementsToReview.count === 1
          ? tt("need.statement", { period, owner: st.ownerName })
          : tt("need.statementMore", { n: det.statementsToReview.count }),
      sub:
        st.netDueMinor === null
          ? ""
          : tt("need.statementSub", { amount: money(st.netDueMinor, st.currency) }),
      href:
        det.statementsToReview.count === 1
          ? `/owners/statements/${st.statementId}`
          : "/owners/statements",
      cta: tt("need.cta.statement"),
    });
  }
  if (syncIssues > 0)
    needs.push({
      key: "failedSync",
      title: tt("need.failedSync", { n: syncIssues }),
      sub: tt("need.failedSyncSub"),
      href: "/sync-health",
      cta: tt("need.cta.failedSync"),
    });
  if (q.unackedRevisions > 0)
    needs.push({
      key: "unacked",
      title: tt("need.unacked", { n: q.unackedRevisions }),
      sub: tt("need.unackedSub"),
      href: "/sync-health",
      cta: tt("need.cta.unacked"),
    });
  if (q.openDisputes > 0)
    needs.push({
      key: "disputes",
      title: tt("need.disputes", { n: q.openDisputes }),
      sub: "",
      href: "/owners/statements",
      cta: tt("need.cta.disputes"),
    });
  if (q.expiringCards > 0)
    needs.push({
      key: "expiringCards",
      title: tt("need.expiringCards", { n: q.expiringCards }),
      sub: tt("need.expiringCardsSub"),
      href: "/reservations?view=payment_action_needed",
      cta: tt("need.cta.expiringCards"),
    });
  const alerts = d.alerts.slice(0, Math.max(0, 8 - needs.length));
  for (const a of alerts)
    needs.push({
      key: `alert-${a.id}`,
      title: a.title,
      sub: a.detail,
      href: a.link,
      cta: tt("need.cta.alert"),
      alert: true,
    });
  const moreAlerts = d.alerts.length - alerts.length;

  // Activity: what changed since yesterday, newest first
  const yesterday = shiftDays(d.today, -1);
  const when = (iso: string) => {
    const at = new Date(iso);
    const sameDay = iso.slice(0, 10) === d.today;
    if (sameDay)
      return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
    return iso.slice(0, 10) === yesterday ? tt("act.yesterday") : dayMonth(iso, locale);
  };
  const activity = [
    ...recent.rows.map((r) => {
      const isNew = r.createdAt.slice(0, 10) >= shiftDays(d.today, -1) && r.status !== "cancelled";
      const range = `${dayMonth(r.arrivalDate, locale)}–${dayMonth(r.departureDate, locale)}`;
      const tags = [channelName(r.otaName), r.propertyTitle];
      if (r.status === "cancelled") tags.push(tt("act.reopened"));
      else if (r.mappingState !== "mapped" || r.unassignedRooms > 0) tags.push(tt("act.needsRoom"));
      return {
        at: r.updatedAt,
        tone: r.status === "cancelled" ? "danger" : isNew ? "warning" : "accent",
        lead:
          r.status === "cancelled"
            ? tt("act.cancelled")
            : isNew
              ? tt("act.newBooking")
              : r.guestName,
        text:
          r.status === "cancelled"
            ? `${r.guestName}, ${range}`
            : isNew
              ? `${r.guestName}, ${range}, ${money(r.totalAmountMinor, r.currency)}`
              : tt("act.changed"),
        sub: tags.join(" · "),
        href: `/reservations/${r.id}`,
      };
    }),
    ...d.alerts.map((a) => ({
      at: a.createdAt,
      tone: a.severity === "critical" ? "danger" : "warning",
      lead: "",
      text: a.title,
      sub: a.detail,
      href: a.link,
    })),
  ]
    .sort((x, y) => (y.at > x.at ? 1 : -1))
    .slice(0, 7);

  // Next 7 nights and the soft ones
  const weekday = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00Z`));
  const weekdayLong = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00Z`));
  const soft = d.next7.filter((n) => n.occupancyBps !== null && n.occupancyBps < 5000);
  const softNames = soft.map((n) => weekdayLong(n.date));
  const softText =
    softNames.length === 0
      ? tt("softNone")
      : tt("soft", {
          days:
            softNames.length === 1
              ? softNames[0]!
              : `${softNames.slice(0, -1).join(", ")} ${tt("and")} ${softNames.at(-1)!}`,
          n: softNames.length,
        });

  const detailsFor = new Map(det.arrivals.map((a) => [a.bookingId, a]));

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard" data-role={d.role}>
      {header}

      {showOps ? (
        <section
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid="today-board"
          aria-label={t("today")}
        >
          <Link href="/reservations?view=arrivals_today" className="contents">
            <Stat
              label={t("arrivals")}
              value={String(d.board.arrivals)}
              hint={
                d.board.arrivals > 0 ? tt("formsDone", { n: det.arrivalsFormsDone }) : undefined
              }
            />
          </Link>
          <Link href="/reservations?view=departures_today" className="contents">
            <Stat
              label={t("departures")}
              value={String(d.board.departures)}
              hint={
                det.sameDayChangeovers > 0
                  ? tt("changeovers", { n: det.sameDayChangeovers })
                  : undefined
              }
            />
          </Link>
          <Stat
            className="hidden lg:flex"
            label={t("occupancyTonight")}
            value={percent(
              d.board.occupancyTonightBps === null ? null : d.board.occupancyTonightBps / 10_000,
            )}
            hint={t("unitsTonight", {
              sold: d.board.roomsSoldTonight,
              total: d.board.roomsAvailable,
            })}
            testId="occupancy-tonight"
          />
          <Stat
            className="hidden lg:flex"
            label={t("revenueToday")}
            value={money(d.board.revenueTodayMinor, cur)}
            hint={
              revDelta === null
                ? undefined
                : tt("vsLastWeek", {
                    delta: `${revDelta >= 0 ? "+" : "−"}${Math.abs(revDelta)}%`,
                    weekday: weekdayLastWeek,
                  })
            }
          />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5">
          {showOps ? (
            <Card
              title={t("needsYou")}
              data-testid="action-queue"
              actions={
                <span className="text-xs text-muted">{t("things", { n: needs.length })}</span>
              }
            >
              {needs.length === 0 ? <EmptyState title={t("queueEmpty")} className="py-2" /> : null}
              <ul className="flex flex-col" data-testid="alerts-widget">
                {needs.map((n) => (
                  <li
                    key={n.key}
                    className="flex items-center justify-between gap-3 border-b border-border/70 py-3 last:border-b-0"
                    data-testid={n.alert ? "alert-row" : undefined}
                  >
                    <Link href={n.href} className="min-w-0 flex-1 text-sm lg:pointer-events-none">
                      <span className="block font-semibold">{n.title}</span>
                      {n.sub ? (
                        <span className="block truncate text-xs text-muted">{n.sub}</span>
                      ) : null}
                    </Link>
                    <LinkButton href={n.href} size="sm" className="hidden shrink-0 lg:inline-flex">
                      {n.cta}
                    </LinkButton>
                    <span className="text-lg text-muted lg:hidden" aria-hidden="true">
                      ›
                    </span>
                  </li>
                ))}
                {moreAlerts > 0 ? (
                  <li>
                    <Link
                      href="/alerts"
                      className="block pt-3 text-sm text-muted hover:text-foreground"
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
                  {arrivals.rows.map((r) => {
                    const x = detailsFor.get(r.id);
                    const late = x?.arrivalTime && x.arrivalTime >= "20:00";
                    return (
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
                            {[
                              r.propertyTitle,
                              channelName(r.otaName),
                              x && x.adults > 0 ? tt("adults", { n: x.adults }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {x?.arrivalTime ? (
                            <Chip size="sm" color={late ? "info" : "default"}>
                              {late
                                ? tt("late", { time: x.arrivalTime.slice(0, 5) })
                                : tt("from", { time: x.arrivalTime.slice(0, 5) })}
                            </Chip>
                          ) : null}
                          {r.mappingState !== "mapped" || r.unassignedRooms > 0 ? (
                            <Chip color="warning" size="sm">
                              {t("needsRoomChip")}
                            </Chip>
                          ) : null}
                          {x?.formDone ? (
                            <Chip color="success" size="sm">
                              {tt("formDone")}
                            </Chip>
                          ) : null}
                          {r.balanceMinor > 0 ? (
                            <Chip color="warning" size="sm">
                              {tt("due", { amount: money(r.balanceMinor, r.currency) })}
                            </Chip>
                          ) : null}
                          {x?.codeSent ? (
                            <Chip color="success" size="sm">
                              {tt("codeSent")}
                            </Chip>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Card
            title={t("activity")}
            actions={
              <Link
                href="/reservations?view=modified_since_yesterday"
                className="text-xs font-semibold text-accent hover:underline"
              >
                {tt("all")}
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
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        a.tone === "danger"
                          ? "bg-danger"
                          : a.tone === "warning"
                            ? "bg-[#f59e0b]"
                            : "bg-accent",
                      )}
                    />
                    <Link href={a.href} className="min-w-0 flex-1 hover:underline">
                      {a.lead ? <strong className="font-semibold">{a.lead}</strong> : null} {a.text}
                      {a.sub ? (
                        <span className="block truncate text-xs text-muted">{a.sub}</span>
                      ) : null}
                    </Link>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{when(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("next7")}>
            <div className="grid grid-cols-7 gap-2" data-testid="next7">
              {d.next7.map((n) => {
                const occ = n.occupancyBps ?? 0;
                return (
                  <div key={n.date} className="flex flex-col items-center gap-1.5 text-xs">
                    <span className="text-muted">{weekday(n.date)}</span>
                    <div className="flex h-16 w-full items-start">
                      <div
                        className={cn(
                          "w-full rounded-md",
                          n.occupancyBps === null
                            ? "bg-default"
                            : occ < 5000
                              ? "bg-[#99f6e4]"
                              : "bg-accent",
                        )}
                        style={{ height: `${Math.max(12, occ / 100)}%` }}
                        title={`${dayLabel(n.date, locale)}: ${percent(n.occupancyBps === null ? null : occ / 10_000)}`}
                      />
                    </div>
                    <span className="font-semibold tabular-nums">
                      {percent(n.occupancyBps === null ? null : occ / 10_000)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-muted">
              {softText}{" "}
              <Link href="/calendar" className="font-semibold text-accent hover:underline">
                {tt("openCalendar")}
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function shiftDays(iso: string, n: number): string {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function SyncPill({
  issues,
  issuesText,
  okText,
}: {
  issues: number;
  issuesText: string;
  okText: string;
}) {
  return (
    <Link href="/sync-health">
      <Chip color={issues > 0 ? "warning" : "success"}>{issues > 0 ? issuesText : okText}</Chip>
    </Link>
  );
}

function PersonCard({
  L,
}: {
  L: { title: string; byline: string; body: string; email: string; whatsapp: string; call: string };
}) {
  const whatsapp = process.env.SUPPORT_WHATSAPP;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#34d399] to-[#22d3ee] text-sm font-bold text-[#0b1020]">
          HH
        </span>
        <div>
          <h2 className="text-base font-bold">{L.title}</h2>
          <p className="text-xs text-muted">{L.byline}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{L.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkButton href="/settings/support" size="sm">
          {L.email}
        </LinkButton>
        {whatsapp ? (
          <LinkButton href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`} size="sm">
            {L.whatsapp}
          </LinkButton>
        ) : null}
        <LinkButton href="/settings/support#call" size="sm">
          {L.call}
        </LinkButton>
      </div>
    </Card>
  );
}
