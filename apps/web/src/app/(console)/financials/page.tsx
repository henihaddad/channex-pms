import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { channelBucket } from "@pms/core";
import { Card, DataTable, LinkButton, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { BUCKET_COLOR, Legend, StackedBars, amounts } from "@/components/finance";
import { channelLabel, dayMonth, money } from "@/lib/format";
import { guard } from "@/server/guard";
import { loadFinancialOverview, loadFinancials } from "./financials.actions";
import { TransactionsTable } from "./transactions-table";

const monthName = (month: string, locale: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    month: style,
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
const prevMonthOf = (month: string) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

/**
 * Financials (spec 11 §11.5b, design board "Financials"). It leads with how money is doing
 * this month — revenue, payments received, what guests still owe, expenses and what owners
 * are owed — then revenue by month and the latest transactions, with what is owed and what
 * the channels took on the right. Below sits what money needs from a person today: every
 * row links to the page that clears it, read from the same repositories, so the two never
 * disagree.
 */
export default async function FinancialsPage() {
  const t = await getTranslations("financials");
  const locale = await getLocale();
  const [o, d] = await Promise.all([
    guard(() => loadFinancialOverview()),
    guard(() => loadFinancials()),
  ]);
  const cur = o.currency;
  const fmt = (minor: number, currency: string) => money(minor, currency, locale);
  const thisMonth = monthName(o.month, locale);
  // "+18% vs Oct same days", only when both sides are in one currency and comparable
  const now = o.revenueMtd.length === 1 ? o.revenueMtd[0]! : null;
  const before = o.revenuePrevSameDays.find((r) => r.currency === now?.currency);
  const change =
    now && before && before.minor > 0
      ? Math.round(((now.minor - before.minor) * 100) / before.minor)
      : null;
  const bucketLabel = {
    airbnb: "Airbnb",
    booking_com: "Booking.com",
    direct: t("direct"),
    other: t("otherChannels"),
  } as const;
  const usedBuckets = (["airbnb", "booking_com", "direct", "other"] as const).filter(
    (b) => b !== "other" || o.revenueByMonth.some((m) => m.buckets.other > 0),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="financials-stats">
        <Stat
          label={t("revenueMtd", { month: thisMonth })}
          value={amounts(o.revenueMtd, cur, locale)}
          hint={
            change === null
              ? t("revenueMtdHint")
              : t("vsSameDays", {
                  change: `${change >= 0 ? "+" : ""}${String(change)}%`,
                  month: monthName(prevMonthOf(o.month), locale),
                })
          }
          testId="revenue-mtd"
        />
        <Stat
          label={t("received")}
          value={amounts(o.receivedMtd, cur, locale)}
          hint={t("receivedHint", { n: o.receivedCount, scheduled: o.instalmentsScheduled })}
        />
        <Stat
          label={t("balanceDue")}
          value={
            <span className={o.balanceDueCount > 0 ? "text-warning" : undefined}>
              {amounts(o.balanceDue, cur, locale)}
            </span>
          }
          hint={t("reservationsCount", { n: o.balanceDueCount })}
          testId="owed-by-guests"
        />
        <Stat
          label={t("expenses")}
          value={amounts(o.expensesMtd, cur, locale)}
          hint={t("expensesHint", { n: o.expensesCount, month: thisMonth })}
        />
        <Stat
          label={t("ownerPayable")}
          value={amounts(o.ownerPayable, cur, locale)}
          hint={t("draftsCount", { n: o.draftStatements })}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title={t("revenueByMonth")}
            actions={
              <Legend
                items={usedBuckets.map((b) => ({ label: bucketLabel[b], color: BUCKET_COLOR[b] }))}
              />
            }
          >
            {o.revenueByMonth.every((m) => m.totalMinor === 0) ? (
              <p className="py-10 text-center text-sm text-muted">{t("noRevenueYet")}</p>
            ) : (
              <StackedBars
                testId="revenue-by-month"
                height={170}
                columns={o.revenueByMonth.map((m) => ({
                  label: monthName(m.month, locale),
                  title: `${monthName(m.month, locale, "long")} · ${fmt(m.totalMinor, cur)}`,
                  segments: usedBuckets.map((b) => ({
                    value: m.buckets[b],
                    color: BUCKET_COLOR[b],
                  })),
                }))}
              />
            )}
          </Card>

          <Card
            title={t("transactions")}
            actions={
              <>
                <LinkButton href="/owners/expenses" variant="secondary" size="sm">
                  + {t("expense")}
                </LinkButton>
                <LinkButton href="/financials/transactions" variant="secondary" size="sm">
                  {t("seeAll")}
                </LinkButton>
              </>
            }
          >
            <TransactionsTable rows={o.transactions} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("balanceDueTitle")}>
            {o.balanceDueRows.length === 0 ? (
              <p className="text-sm text-muted">{t("nobodyOwes")}</p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="balance-due">
                {o.balanceDueRows.map((b) => {
                  const where =
                    b.arrival > o.today
                      ? t("arrives", { day: dayMonth(b.arrival, locale) })
                      : b.departure > o.today
                        ? t("inHouse")
                        : t("departed", { day: dayMonth(b.departure, locale) });
                  return (
                    <li key={b.bookingId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/reservations/${b.bookingId}`}
                          className="block truncate text-sm font-semibold text-foreground hover:underline"
                        >
                          {b.guest ?? b.reference}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {b.propertyTitle} · {where}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-warning tabular-nums">
                        {fmt(b.balanceMinor, b.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {o.balanceDueCount > o.balanceDueRows.length ? (
              <p className="mt-2 text-xs text-muted">
                {t("andMore", { n: o.balanceDueCount - o.balanceDueRows.length })}
              </p>
            ) : null}
          </Card>

          <Card title={t("touristTax", { month: monthName(o.month, locale, "long") })}>
            <p className="font-display text-[1.375rem] font-bold text-foreground tabular-nums">
              {amounts(o.touristTax.amounts, cur, locale)}
            </p>
            <p className="text-xs text-muted">
              {o.touristTax.stays > 0
                ? t("touristTaxHint", { n: o.touristTax.stays })
                : t("touristTaxNone")}
            </p>
            <Link
              href="/reports?key=daily_revenue"
              className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline"
            >
              {t("taxReport")}
            </Link>
          </Card>

          <Card title={t("feesThisMonth")}>
            {o.fees.length === 0 ? (
              <p className="text-sm text-muted">{t("noFees")}</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-2 text-[13px]">
                {o.fees.map((f) => (
                  <div key={`${f.channel}-${f.currency}`} className="contents">
                    <dt className="text-foreground">
                      {channelBucket(f.channel) === "airbnb"
                        ? t("airbnbFee")
                        : channelBucket(f.channel) === "booking_com"
                          ? t("bookingCommission")
                          : t("channelCommission", {
                              channel: channelLabel(f.channel, t("direct")),
                            })}
                    </dt>
                    <dd className="text-end tabular-nums">{fmt(f.commissionMinor, f.currency)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-2.5 text-xs text-muted">{t("feesHint")}</p>
          </Card>
        </div>
      </div>

      <SectionTitle>{t("waiting")}</SectionTitle>
      <p className="-mt-4 max-w-[640px] text-sm text-muted">{t("lead")}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("statementsToApprove")} description={t("statementsToApproveHint")}>
          <DataTable
            testId="statements-to-approve"
            columns={[t("owner"), t("period"), { label: t("net"), align: "end" }, ""]}
            empty={t("nothingWaiting")}
            rows={d.statementsToApprove.map((s) => [
              s.owner,
              monthName(s.period, locale, "long"),
              fmt(s.netMinor, s.currency),
              <Link
                key={s.id}
                href={`/owners/statements/${s.id}`}
                className="text-accent hover:underline"
              >
                {t("review")}
              </Link>,
            ])}
          />
        </Card>

        <Card title={t("statementsToSend")} description={t("statementsToSendHint")}>
          <DataTable
            testId="statements-to-send"
            columns={[t("owner"), t("period"), { label: t("net"), align: "end" }, ""]}
            empty={t("nothingWaiting")}
            rows={d.statementsToSend.map((s) => [
              s.owner,
              monthName(s.period, locale, "long"),
              fmt(s.netMinor, s.currency),
              <Link
                key={s.id}
                href={`/owners/statements/${s.id}`}
                className="text-accent hover:underline"
              >
                {t("open")}
              </Link>,
            ])}
          />
        </Card>

        <Card title={t("payoutsToRecord")} description={t("payoutsToRecordHint")}>
          <DataTable
            testId="payouts-to-record"
            columns={[t("owner"), t("state"), { label: t("amount"), align: "end" }, ""]}
            empty={t("nothingWaiting")}
            rows={d.payoutsToRecord.map((p) => [
              p.owner,
              t(`payoutState.${p.state}`),
              fmt(p.amountMinor, p.currency),
              <Link key={p.id} href="/owners/payouts" className="text-accent hover:underline">
                {t("open")}
              </Link>,
            ])}
          />
        </Card>

        <Card title={t("expensesToApprove")} description={t("expensesToApproveHint")}>
          <DataTable
            testId="expenses-to-approve"
            columns={[t("property"), t("what"), { label: t("amount"), align: "end" }, ""]}
            empty={t("nothingWaiting")}
            rows={d.expensesToApprove.map((e) => [
              e.property,
              e.description,
              fmt(e.amountMinor, e.currency),
              <Link key={e.id} href="/owners/expenses" className="text-accent hover:underline">
                {t("review")}
              </Link>,
            ])}
          />
        </Card>

        <Card title={t("instalmentsDue")} description={t("instalmentsDueHint")}>
          <DataTable
            testId="instalments-due"
            columns={[
              t("reference"),
              t("due"),
              { label: t("amount"), align: "end" },
              t("attempts"),
              "",
            ]}
            empty={t("nothingWaiting")}
            rows={d.instalmentsDue.map((i) => [
              i.reference,
              dayMonth(i.dueOn, locale),
              fmt(i.amountMinor, i.currency),
              String(i.attempts),
              <Link
                key={i.id}
                href="/financials/payment-rules"
                className="text-accent hover:underline"
              >
                {t("rules")}
              </Link>,
            ])}
          />
        </Card>

        <Card title={t("unpaidFolios")} description={t("unpaidFoliosHint")}>
          <DataTable
            testId="unpaid-folios"
            columns={[t("reference"), { label: t("balance"), align: "end" }, ""]}
            empty={t("nothingWaiting")}
            rows={d.unpaidFolios.map((f) => [
              f.reference,
              fmt(f.balanceMinor, f.currency),
              <Link
                key={f.bookingId}
                href={`/reservations/${f.bookingId}`}
                className="text-accent hover:underline"
              >
                {t("open")}
              </Link>,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
