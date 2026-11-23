import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Chip, Stat } from "@/components/ui";
import { Eyebrow } from "@/components/site";
import { guard } from "@/server/guard";
import { channelLabel, dayMonth, money, nightsBetween, percent } from "@/lib/format";
import {
  loadPortalCalendar,
  loadPortalHome,
  loadPortalStatements,
  loadPortalWho,
} from "./portal.actions";
import { OwnerStayForm } from "./owner-stay-form";

/** Today and the next 60 nights (UTC dates); computed outside render so the component stays pure. */
const next60 = (): { from: string; to: string; dates: string[] } => {
  const start = new Date();
  const dates = Array.from({ length: 60 }, (_, i) =>
    new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
  return {
    from: dates[0]!,
    to: new Date(start.getTime() + 60 * 86_400_000).toISOString().slice(0, 10),
    dates,
  };
};

/** "March" / "Mar" in the owner's language (a statement period is a UTC calendar month). */
const monthName = (iso: string, style: "long" | "short", locale: string) =>
  new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.home") };
}

/**
 * The owner's month at a glance (spec 17 §17.5; persona: the owner): what this month
 * will pay them, occupancy and the average nightly rate, the next payout, the
 * statements to the cent, the next 60 nights, blocking nights for their own stay, and
 * the stays coming up. Guest names stay off this page (PORT-1).
 */
export default async function OwnerHome() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const days = next60();
  const [v, statements, cal, who] = await Promise.all([
    guard(() => loadPortalHome()),
    guard(() => loadPortalStatements()),
    guard(() => loadPortalCalendar({ from: days.from, to: days.to })),
    guard(() => loadPortalWho()),
  ]);
  const d = v.dashboard;
  const cur = d.currency;
  const mon = monthName(v.monthFrom, "short", locale);
  const nextPayout = statements.find((s) => s.state === "sent");
  const booked = new Set<string>();
  const blocked = new Set<string>();
  for (const b of cal.bookings)
    if (b.status !== "cancelled")
      for (const date of days.dates)
        if (date >= b.arrivalDate && date < b.departureDate) booked.add(date);
  for (const b of cal.blocks)
    for (const date of days.dates) if (date >= b.dateFrom && date < b.dateTo) blocked.add(date);
  const upcoming = cal.bookings
    .filter((b) => b.status !== "cancelled" && b.departureDate > days.from)
    .slice(0, 5);
  const titles = [...new Set(cal.properties.map((p) => p.title))];
  return (
    <div className="flex flex-col gap-5" data-testid="owner-dashboard">
      <div className="flex flex-col gap-1.5">
        {titles.length ? <Eyebrow>{titles.join(" · ")}</Eyebrow> : null}
        <h1 className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.025em] text-foreground sm:text-[36px]">
          {titles.length > 1 ? t("headlineMany") : t("headline")}
        </h1>
        <p className="sr-only">{t("welcome", { name: who.ownerName })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("monthSoFar", { month: monthName(v.monthFrom, "long", locale) })}
          value={money(d.projectedNetMinor ?? d.grossMinor, cur, locale)}
          hint={d.projectedNetMinor === null ? t("grossNoDraft") : t("afterSplit")}
        />
        <Stat
          label={t("occupancyMonth", { month: mon })}
          value={d.unitNights > 0 ? percent(d.nightsSold / d.unitNights, { locale }) : "—"}
          hint={
            d.unitNights > 0
              ? t("nightsOf", { sold: d.nightsSold, total: d.unitNights })
              : undefined
          }
        />
        <Stat
          label={t("adrMonth", { month: mon })}
          value={
            d.nightsSold > 0 ? money(Math.round(d.grossMinor / d.nightsSold), cur, locale) : "—"
          }
          hint={t("adrHint")}
        />
        <Stat
          label={t("nextPayout")}
          value={
            nextPayout
              ? money(
                  Number(nextPayout.totals.payable ?? nextPayout.totals.netDue ?? 0),
                  nextPayout.currency,
                  locale,
                )
              : "—"
          }
          hint={
            nextPayout
              ? t("statementOf", { month: monthName(nextPayout.periodFrom, "long", locale) })
              : t("noPayoutDue")
          }
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card
            title={t("nav.statements")}
            actions={<span className="text-xs text-muted">{t("toTheCent")}</span>}
          >
            {statements.length === 0 ? (
              <p className="text-sm text-muted">{t("noStatements")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2.5 text-start font-semibold">{t("month")}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{t("netRevenue")}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{t("yourShare")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t("state")}</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {statements.slice(0, 6).map((s) => (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <Link href={`/owner/statements/${s.id}`} className="hover:text-accent">
                            {monthName(s.periodFrom, "long", locale)} {s.periodFrom.slice(0, 4)}
                            {titles.length > 1 ? (
                              <span className="block text-xs text-muted">{s.propertyTitle}</span>
                            ) : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {money(Number(s.totals.revenueBasis ?? 0), s.currency, locale)}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {money(Number(s.totals.netDue ?? 0), s.currency, locale)}
                        </td>
                        <td className="px-4 py-3">
                          {s.disputeState === "open" ? (
                            <Chip color="warning" size="sm">
                              {t("disputeOpen")}
                            </Chip>
                          ) : s.state === "paid" ? (
                            <Chip color="success" size="sm">
                              {t("statePaid")}
                            </Chip>
                          ) : (
                            <Chip color="accent" size="sm">
                              {s.sentAt
                                ? t("stateSentOn", { date: dayMonth(s.sentAt, locale) })
                                : t("stateReady")}
                            </Chip>
                          )}
                        </td>
                        <td className="px-4 py-3 text-end">
                          {s.pdfRef ? (
                            <a
                              href={s.pdfRef}
                              download={`statement-${s.periodFrom.slice(0, 7)}.pdf`}
                              className="font-semibold text-accent"
                              aria-label={t("downloadFor", {
                                month: `${monthName(s.periodFrom, "long", locale)} ${s.periodFrom.slice(0, 4)}`,
                              })}
                            >
                              PDF
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title={t("next60")}>
            <div
              className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1"
              role="img"
              aria-label={t("next60Label", { booked: booked.size, blocked: blocked.size })}
            >
              {days.dates.map((date) => (
                <span
                  key={date}
                  title={dayMonth(date, locale)}
                  className={
                    booked.has(date)
                      ? "h-[22px] rounded-[5px] bg-accent"
                      : blocked.has(date)
                        ? "h-[22px] rounded-[5px] bg-warning/60"
                        : "h-[22px] rounded-[5px] bg-border"
                  }
                />
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted">{t("next60Hint")}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title={t("blockTitle")}>
            {cal.properties.length === 0 ? (
              <p className="text-sm text-muted">{t("noProperties")}</p>
            ) : (
              <OwnerStayForm
                properties={cal.properties}
                min={days.from}
                hint={t("blockHint")}
                labels={{
                  title: t("blockTitle"),
                  property: t("property"),
                  firstNight: t("firstNight"),
                  lastNight: t("lastNight"),
                  note: t("note"),
                  block: t("block"),
                  blocking: t("blocking"),
                }}
              />
            )}
          </Card>
          <Card title={t("upcoming")}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">{t("noBookings")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex justify-between gap-3">
                    <span>
                      {dayMonth(b.arrivalDate, locale)} → {dayMonth(b.departureDate, locale)} ·{" "}
                      {t("nightsCount", { count: nightsBetween(b.arrivalDate, b.departureDate) })}
                    </span>
                    <span className="text-muted">{channelLabel(b.channel, t("direct"))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("questions")}>
            <p className="text-sm text-muted">{t("questionsBody", { manager: who.orgName })}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
