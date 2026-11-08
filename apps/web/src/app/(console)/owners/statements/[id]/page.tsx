import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { statementOtherLines, statementReservations } from "@pms/core";
import {
  Alert,
  Button,
  Card,
  Chip,
  DataTable,
  Input,
  PageHeader,
  Select,
  TBody,
  Table,
  Td,
  Tr,
  cn,
} from "@/components/ui";
import { dayMonth, money as fmtMoney, nightsBetween, stay } from "@/lib/format";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import {
  approvePayoutAction,
  approveStatementAction,
  initiatePayoutAction,
  loadStatement,
  resolveDisputeAction,
  sendStatementAction,
} from "../../owners.actions";

const TOTAL_KEYS = [
  "grossRevenue",
  "otaCommission",
  "withheldTax",
  "revenueBasis",
  "managementFee",
  "feeVat",
  "cleaning",
  "expenses",
  "ownerStays",
  "adjustments",
  "holdBackReleased",
  "holdBackRetained",
  "netDue",
  "payable",
] as const;

const STATE_TONE: Record<string, "warning" | "info" | "success" | "default"> = {
  draft: "warning",
  approved: "info",
  sent: "success",
  paid: "success",
};

const monthYear = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));

/**
 * One owner statement (spec 17 §17.2, STMT-5, design board "Owner statement"): the revenue
 * per reservation with its nights in the period and channel fee, every other line, the
 * totals down to the owner's share, and approve → send → pay. The statement is still the
 * per-night ledger underneath; every line and the comparison with last period stay one
 * click away.
 */
export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("owners");
  const locale = await getLocale();
  const v = await guard(() => loadStatement({ id }));
  if (!v) notFound();
  const st = v.statement;
  const prev = v.previous;
  const cur = st.currency;
  const fmt = (minor: number) => fmtMoney(minor, cur, locale);
  const tot = (k: string) => Number(st.totals[k] ?? 0);
  const reservations = statementReservations(st.lines);
  const other = statementOtherLines(st.lines);
  const days = nightsBetween(st.periodFrom, st.periodTo);
  const nights = reservations.reduce((a, r) => a + r.nights, 0);
  const fee = tot("managementFee") + tot("feeVat");
  const model = v.agreement?.model;
  const managerPct = model?.kind === "commission_pct" ? model.rateBps / 100 : null;
  const split =
    managerPct !== null && v.agreement
      ? t("splitPct", {
          owner: 100 - managerPct,
          manager: managerPct,
          basis: t(`splitBasis.${v.agreement.commissionBasis}`),
        })
      : null;
  const firstName = st.ownerName.split(/\s+/)[0] ?? st.ownerName;
  const totals: Array<[string, number, string?]> = [
    [t("lines.accommodation"), tot("grossRevenue")],
    [t("lines.channelFees"), -(tot("otaCommission") + tot("withheldTax"))],
    [t("lines.cleaning"), tot("cleaning")],
    [t("lines.expenses"), -tot("expenses")],
    [t("lines.ownerStays"), -tot("ownerStays")],
    [t("lines.adjustments"), tot("adjustments")],
    [t("lines.holdBackReleased"), tot("holdBackReleased")],
    [t("lines.holdBackRetained"), -tot("holdBackRetained")],
  ];
  const visibleTotals = totals.filter(([, n], i) => i < 2 || n !== 0);

  return (
    <div className="flex flex-col gap-6" data-testid="statement-detail" data-state={st.state}>
      <PageHeader
        crumb={[
          { href: "/owners", label: t("title") },
          { href: `/owners/${st.ownerId}`, label: st.ownerName },
          { label: monthYear(st.periodFrom, locale) },
        ]}
        title={t("ownerStatement")}
      />

      {st.anomalies.length ? (
        <Alert tone="warning" title={t("reviewFlags")}>
          <ul className="list-disc ps-5 text-xs" data-testid="anomalies">
            {st.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card
          title={`${st.propertyTitle} · ${monthYear(st.periodFrom, locale)}`}
          description={[
            st.ownerName,
            split,
            nights <= days
              ? t("occupancy", {
                  n: nights,
                  days,
                  pct: Math.round((nights * 100) / Math.max(1, days)),
                })
              : t("nightsBooked", { n: nights }),
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <span className="flex items-center gap-2">
              {st.disputeState === "open" ? (
                <Chip color="danger" size="sm">
                  {t("disputed")}
                </Chip>
              ) : null}
              <Chip
                color={STATE_TONE[st.state] ?? "default"}
                size="sm"
                data-testid="statement-state"
              >
                {t(`statementState.${st.state}`)}
              </Chip>
            </span>
          }
          contentClassName="flex flex-col gap-4"
        >
          <h3 className="text-sm font-semibold text-foreground">{t("revenue")}</h3>
          <DataTable
            testId="statement-revenue"
            columns={[
              t("reservation"),
              t("nightsIn", { month: monthYear(st.periodFrom, locale).split(" ")[0] ?? "" }),
              { label: t("accommodation"), align: "end" },
              { label: t("channelFee"), align: "end" },
              { label: t("net"), align: "end" },
            ]}
            empty={t("noRevenue")}
            rows={reservations.map((r) => {
              const total =
                r.arrival && r.departure ? nightsBetween(r.arrival, r.departure) : r.nights;
              return [
                <Link key="r" href={`/reservations/${r.bookingId}`} className="hover:underline">
                  {[r.guest, r.channel].filter(Boolean).join(" · ")}
                </Link>,
                <span key="n">
                  {r.arrival && r.departure ? `${stay(r.arrival, r.departure, locale)} · ` : ""}
                  {total === r.nights
                    ? t("nightsN", { n: r.nights })
                    : t("nightsPartial", { n: total, inPeriod: r.nights })}
                </span>,
                fmt(r.accommodationMinor),
                r.channelFeeMinor ? fmt(r.channelFeeMinor) : "—",
                fmt(r.netMinor),
              ];
            })}
          />
          <h3 className="text-sm font-semibold text-foreground">{t("expensesAndFees")}</h3>
          <DataTable
            testId="statement-other"
            columns={[t("item"), t("date"), { label: t("amount"), align: "end" }]}
            empty={t("noOtherLines")}
            rows={other.map((l) => [
              <span key="i">
                {l.description}
                {l.adjustmentId && l.basis.originStatementId ? (
                  <Link
                    className="ms-1 text-accent hover:underline"
                    href={`/owners/statements/${String(l.basis.originStatementId)}`}
                  >
                    ({t("origin")})
                  </Link>
                ) : null}
              </span>,
              dayMonth(l.date, locale),
              fmt(l.amountMinor),
            ])}
          />
          {st.warnings.map((w) => (
            <p key={w} className="text-xs text-warning-soft-foreground">
              {w}
            </p>
          ))}
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted select-none hover:text-foreground">
              {t("everyLine", { n: st.lines.length })}
            </summary>
            <p className="mt-2 mb-1 text-xs text-muted">
              {(
                st.segments as Array<{
                  version: number;
                  from: string;
                  to: string;
                  commissionBasis: string;
                }>
              )
                .map(
                  (s) =>
                    `v${String(s.version)} ${s.from}→${s.to} · ${t(`splitBasis.${s.commissionBasis}`)}`,
                )
                .join(" · ")}
            </p>
            <Table data-testid="statement-lines" dense>
              <TBody>
                {st.lines.map((l) => (
                  <Tr key={l.id} data-kind={l.kind}>
                    <Td className="whitespace-nowrap">{dayMonth(l.date, locale)}</Td>
                    <Td>
                      {l.bookingId ? (
                        <Link className="hover:underline" href={`/reservations/${l.bookingId}`}>
                          {l.description}
                        </Link>
                      ) : (
                        l.description
                      )}
                    </Td>
                    <Td className="text-end tabular-nums">{fmt(l.amountMinor)}</Td>
                    <Td className="text-muted">v{l.agreementVersion}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </details>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("totalsTitle")}>
            <dl
              className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm"
              data-testid="statement-summary"
            >
              {visibleTotals.map(([label, n]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-end tabular-nums">{fmt(n)}</dd>
                </div>
              ))}
              <dt className="border-t border-border pt-2.5 font-semibold">{t("lines.net")}</dt>
              <dd className="border-t border-border pt-2.5 text-end font-semibold tabular-nums">
                {fmt(tot("netDue") + fee)}
              </dd>
              <dt className="text-muted">
                {managerPct !== null ? t("managerPct", { pct: managerPct }) : t("manager")}
                {tot("feeVat") ? ` ${t("inclVat")}` : ""}
              </dt>
              <dd className="text-end tabular-nums">{fmt(fee)}</dd>
              <dt className="border-t-2 border-foreground pt-3 font-display text-lg font-bold">
                {managerPct !== null ? t("ownerPct", { pct: 100 - managerPct }) : t("ownerShare")}
              </dt>
              <dd className="border-t-2 border-foreground pt-3 text-end font-display text-lg font-bold tabular-nums">
                {fmt(tot("netDue"))}
              </dd>
              {tot("payable") !== tot("netDue") ? (
                <>
                  <dt className="text-muted">{t("totals.payable")}</dt>
                  <dd className="text-end tabular-nums">{fmt(tot("payable"))}</dd>
                </>
              ) : null}
            </dl>
            <p className="mt-3 text-xs text-muted">{t("roundingNote")}</p>

            <div className="mt-4 flex flex-col gap-2">
              {st.state === "draft" ? (
                <form action={approveStatementAction}>
                  <input type="hidden" name="id" value={st.id} />
                  <Button type="submit" size="lg" fullWidth data-testid="approve-statement">
                    {t("approveStatement")}
                  </Button>
                </form>
              ) : null}
              {st.state === "approved" ? (
                <form action={sendStatementAction}>
                  <input type="hidden" name="id" value={st.id} />
                  <Button type="submit" size="lg" fullWidth data-testid="send-statement">
                    {t("sendTo", { name: firstName })}
                  </Button>
                </form>
              ) : null}
              {st.state === "sent" && st.payouts.every((p) => p.state === "failed") ? (
                <form action={initiatePayoutAction} className="flex flex-col gap-2">
                  <input type="hidden" name="statementId" value={st.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <Select name="method" defaultValue="manual" size="sm" aria-label={t("method")}>
                      <option value="manual">{t("manualTransfer")}</option>
                      <option value="provider">{v.payoutProvider}</option>
                    </Select>
                    <Input name="reference" placeholder={t("bankReference")} />
                  </div>
                  <Button type="submit" size="lg" fullWidth data-testid="initiate-payout">
                    {t("recordPayout")} {fmt(tot("payable"))}
                  </Button>
                  <span className="text-xs text-muted">
                    {t("fourEyesAbove", { amount: fmt(v.fourEyesThreshold) })}
                  </span>
                </form>
              ) : null}
              {st.pdfRef ? (
                <a
                  className={cn(
                    "inline-flex h-9.5 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-default",
                  )}
                  href={st.pdfRef}
                  download={`statement-${st.periodFrom.slice(0, 7)}.pdf`}
                  data-testid="pdf-link"
                >
                  PDF
                </a>
              ) : (
                <p className="text-center text-xs text-muted">{t("pdfOnSend")}</p>
              )}
            </div>

            {st.disputeState === "open" ? (
              <form
                action={resolveDisputeAction}
                className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm"
              >
                <input type="hidden" name="id" value={st.id} />
                {st.disputeThreadId ? (
                  <Link
                    className="text-accent hover:underline"
                    href={`/inbox?view=all&thread=${st.disputeThreadId}`}
                  >
                    {t("openThread")}
                  </Link>
                ) : null}
                <Button type="submit" variant="secondary" size="sm">
                  {t("markResolved")}
                </Button>
              </form>
            ) : null}
          </Card>

          <Card title={t("payouts")}>
            {st.payouts.length === 0 ? (
              <p className="text-sm text-muted">{t("noPayouts")}</p>
            ) : null}
            {st.payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 border-t border-border py-2 text-sm first:border-0 first:pt-0"
                data-testid="payout-row"
                data-state={p.state}
              >
                <span>
                  {fmtMoney(p.amountMinor, p.currency, locale)} · {p.method}
                  {p.providerRef ? ` · ${p.providerRef}` : ""}
                  {p.failureReason ? (
                    <span className="text-danger"> · {p.failureReason}</span>
                  ) : null}
                </span>
                {p.state === "awaiting_approval" ? (
                  <form action={approvePayoutAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      data-testid="approve-payout"
                      size="sm"
                    >
                      {t("approvePayout")}
                    </Button>
                  </form>
                ) : (
                  <Chip
                    color={
                      p.state === "paid" ? "success" : p.state === "failed" ? "danger" : "warning"
                    }
                    size="sm"
                  >
                    {t.has(`payoutStates.${p.state}`) ? t(`payoutStates.${p.state}`) : p.state}
                  </Chip>
                )}
              </div>
            ))}
          </Card>

          <Card title={t("previousStatements")}>
            {v.history.length === 0 ? (
              <p className="text-sm text-muted">{t("noPrevious")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {v.history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <Link href={`/owners/statements/${h.id}`} className="hover:underline">
                      {monthYear(h.periodFrom, locale)}
                    </Link>
                    <span className="flex items-center gap-2 tabular-nums">
                      {fmtMoney(Number(h.totals.netDue ?? 0), h.currency, locale)}
                      <Chip color={STATE_TONE[h.state] ?? "default"} size="sm">
                        {t(`statementState.${h.state}`)}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted select-none hover:text-foreground">
                {prev
                  ? t("compareWith", { period: monthYear(prev.periodFrom, locale) })
                  : t("allTotals")}
              </summary>
              <Table data-testid="statement-totals" dense className="mt-2 text-xs">
                <TBody>
                  {TOTAL_KEYS.map((k) => (
                    <Tr key={k} className={k === "netDue" ? "font-semibold" : ""}>
                      <Td>{t(`totals.${k}`)}</Td>
                      <Td className="text-end tabular-nums" data-total={k}>
                        {money(Number(st.totals[k] ?? 0), st.currency)}
                      </Td>
                      <Td className="text-end text-muted tabular-nums">
                        {prev ? money(Number(prev.totals[k] ?? 0), st.currency) : ""}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}
