import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Chip,
  Input,
  PageTitle,
  Select,
  TBody,
  Table,
  Td,
  Tr,
} from "@/components/ui";
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
        <span className="rounded bg-background px-2 py-0.5" data-testid="statement-state">
          {st.state}
        </span>
        {st.disputeState === "open" ? (
          <form action={resolveDisputeAction} className="flex items-center gap-1">
            <input type="hidden" name="id" value={st.id} />
            <Chip color="danger" size="sm">
              {t("disputed")}
            </Chip>
            {st.disputeThreadId ? (
              <Link className="underline" href={`/inbox?view=all&thread=${st.disputeThreadId}`}>
                {t("openThread")}
              </Link>
            ) : null}
            <Button type="submit" variant="secondary" size="sm">
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
            <Select
              name="method"

              defaultValue="manual"
              size="sm"
            >
              <option value="manual">{t("manualTransfer")}</option>
              <option value="provider">{v.payoutProvider}</option>
            </Select>
            <Input name="reference" placeholder={t("bankReference")} />
            <Button type="submit" variant="secondary" data-testid="initiate-payout" size="sm">
              {t("recordPayout")} {money(Number(st.totals.payable ?? 0), st.currency)}
            </Button>
            <span className="text-xs text-muted">
              {t("fourEyesAbove", { amount: money(v.fourEyesThreshold, st.currency) })}
            </span>
          </form>
        ) : null}
      </div>
      {st.anomalies.length ? (
        <Card className="border-warning/50 bg-warning-soft text-sm" title={t("reviewFlags")}>
          <ul className="list-disc ps-5 text-xs" data-testid="anomalies">
            {st.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card>
          <p className="mb-1 text-xs text-muted">
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
          <Table data-testid="statement-lines">
            <TBody>
              {st.lines.map((l) => (
                <Tr key={l.id} data-kind={l.kind}>
                  <Td>{l.date}</Td>
                  <Td>{l.kind.replace(/_/g, " ")}</Td>
                  <Td>
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
                  </Td>
                  <Td className="text-end tabular-nums">{money(l.amountMinor, st.currency)}</Td>
                  <Td>v{l.agreementVersion}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {st.warnings.map((w) => (
            <p key={w} className="text-xs text-warning-soft-foreground">
              {w}
            </p>
          ))}
        </Card>
        <div className="space-y-4">
          <Card className="text-xs">
            <Table data-testid="statement-totals">
              <TBody>
                {TOTAL_KEYS.map((k) => (
                  <Tr key={k} className={k === "netDue" ? "font-semibold" : ""}>
                    <Td>{t(`totals.${k}`)}</Td>
                    <Td className="text-end tabular-nums" data-total={k}>
                      {money(Number(st.totals[k] ?? 0), st.currency)}
                    </Td>
                    <Td className="text-end tabular-nums">
                      {prev ? money(Number(prev.totals[k] ?? 0), st.currency) : ""}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {prev ? (
              <p className="mt-1 text-muted">
                {t("previousColumn", { period: prev.periodFrom.slice(0, 7) })}
              </p>
            ) : null}
          </Card>
          <Card className="text-xs" title={t("payouts")}>
            {st.payouts.length === 0 ? <p className="text-muted">{t("noPayouts")}</p> : null}
            {st.payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-t border-border py-1"
                data-testid="payout-row"
                data-state={p.state}
              >
                <span>
                  {money(p.amountMinor, p.currency)} · {p.method} · {p.state}
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
                ) : null}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
