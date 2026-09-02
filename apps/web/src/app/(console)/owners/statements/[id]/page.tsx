import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
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

/** Statement review (STMT-5): the argument line by line, the diff against last period, anomaly flags, approve/send/pay. */
export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("owners");
  const v = await guard(() => loadStatement({ id }));
  if (!v) notFound();
  const st = v.statement;
  const prev = v.previous;
  return (
    <div className="space-y-4" data-testid="statement-detail" data-state={st.state}>
      <PageTitle>
        {t("statement")} {st.periodFrom.slice(0, 7)} · {st.ownerName} · {st.propertyTitle}
      </PageTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-slate-100 px-2 py-0.5" data-testid="statement-state">
          {st.state}
        </span>
        {st.disputeState === "open" ? (
          <form action={resolveDisputeAction} className="flex items-center gap-1">
            <input type="hidden" name="id" value={st.id} />
            <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800">{t("disputed")}</span>
            {st.disputeThreadId ? (
              <Link className="underline" href={`/inbox?view=all&thread=${st.disputeThreadId}`}>
                {t("openThread")}
              </Link>
            ) : null}
            <Button type="submit" variant="secondary" className="h-7 text-xs">
              {t("markResolved")}
            </Button>
          </form>
        ) : null}
        {st.state === "draft" ? (
          <form action={approveStatementAction}>
            <input type="hidden" name="id" value={st.id} />
            <Button type="submit" data-testid="approve-statement">
              {t("approve")}
            </Button>
          </form>
        ) : null}
        {st.state === "approved" ? (
          <form action={sendStatementAction}>
            <input type="hidden" name="id" value={st.id} />
            <Button type="submit" data-testid="send-statement">
              {t("send")}
            </Button>
          </form>
        ) : null}
        {st.pdfRef ? (
          <a
            className="underline"
            href={st.pdfRef}
            download={`statement-${st.periodFrom.slice(0, 7)}.pdf`}
            data-testid="pdf-link"
          >
            PDF
          </a>
        ) : null}
        {st.state === "sent" && st.payouts.every((p) => p.state === "failed") ? (
          <form action={initiatePayoutAction} className="flex items-center gap-1">
            <input type="hidden" name="statementId" value={st.id} />
            <select
              name="method"
              className="h-8 rounded border border-slate-300 px-1 text-xs"
              defaultValue="manual"
            >
              <option value="manual">{t("manualTransfer")}</option>
              <option value="provider">{v.payoutProvider}</option>
            </select>
            <input
              name="reference"
              placeholder={t("bankReference")}
              className="h-8 rounded border border-slate-300 px-2 text-xs"
            />
            <Button
              type="submit"
              variant="secondary"
              className="h-8 text-xs"
              data-testid="initiate-payout"
            >
              {t("recordPayout")} {money(Number(st.totals.payable ?? 0), st.currency)}
            </Button>
            <span className="text-xs text-slate-500">
              {t("fourEyesAbove", { amount: money(v.fourEyesThreshold, st.currency) })}
            </span>
          </form>
        ) : null}
      </div>
      {st.anomalies.length ? (
        <Card className="border-amber-200 bg-amber-50 text-sm">
          <p className="font-medium">{t("reviewFlags")}</p>
          <ul className="list-disc ps-5 text-xs" data-testid="anomalies">
            {st.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card>
          <p className="mb-1 text-xs text-slate-500">
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
                  `v${String(s.version)} ${s.from}→${s.to} on ${s.commissionBasis.replace(/_/g, " ")}`,
              )
              .join(" · ")}
          </p>
          <table className="w-full text-xs" data-testid="statement-lines">
            <tbody>
              {st.lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100" data-kind={l.kind}>
                  <td className="py-0.5 text-slate-500">{l.date}</td>
                  <td>{l.kind.replace(/_/g, " ")}</td>
                  <td>
                    {l.bookingId ? (
                      <Link className="underline" href={`/reservations/${l.bookingId}`}>
                        {l.description}
                      </Link>
                    ) : (
                      l.description
                    )}
                    {l.adjustmentId && l.basis.originStatementId ? (
                      <Link
                        className="ms-1 underline"
                        href={`/owners/statements/${String(l.basis.originStatementId)}`}
                      >
                        ({t("origin")})
                      </Link>
                    ) : null}
                  </td>
                  <td className="text-end tabular-nums">{money(l.amountMinor, st.currency)}</td>
                  <td className="text-slate-400">v{l.agreementVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {st.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-800">
              {w}
            </p>
          ))}
        </Card>
        <div className="space-y-4">
          <Card className="text-xs">
            <table className="w-full" data-testid="statement-totals">
              <tbody>
                {TOTAL_KEYS.map((k) => (
                  <tr key={k} className={k === "netDue" ? "font-semibold" : ""}>
                    <td className="py-0.5">{t(`totals.${k}`)}</td>
                    <td className="text-end tabular-nums" data-total={k}>
                      {money(Number(st.totals[k] ?? 0), st.currency)}
                    </td>
                    <td className="text-end text-slate-400 tabular-nums">
                      {prev ? money(Number(prev.totals[k] ?? 0), st.currency) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {prev ? (
              <p className="mt-1 text-slate-500">
                {t("previousColumn", { period: prev.periodFrom.slice(0, 7) })}
              </p>
            ) : null}
          </Card>
          <Card className="text-xs">
            <p className="font-medium">{t("payouts")}</p>
            {st.payouts.length === 0 ? <p className="text-slate-500">{t("noPayouts")}</p> : null}
            {st.payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-t border-slate-100 py-1"
                data-testid="payout-row"
                data-state={p.state}
              >
                <span>
                  {money(p.amountMinor, p.currency)} · {p.method} · {p.state}
                  {p.providerRef ? ` · ${p.providerRef}` : ""}
                  {p.failureReason ? (
                    <span className="text-rose-700"> · {p.failureReason}</span>
                  ) : null}
                </span>
                {p.state === "awaiting_approval" ? (
                  <form action={approvePayoutAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      className="h-7 text-xs"
                      data-testid="approve-payout"
                    >
                      {t("approvePayout")}
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
