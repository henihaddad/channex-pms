import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Card,
  Label,
  PageTitle,
  SubmitButton,
  TBody,
  Table,
  Td,
  Textarea,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { day, money } from "@/lib/format";
import { disputeStatementAction, loadPortalStatement } from "../../portal.actions";
import { periodLabel } from "../../period";

/** One read per request: the title and the page share it, so the audited read is logged once. */
const statement = cache((id: string) => guard(() => loadPortalStatement({ id })));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, locale] = await Promise.all([params, getTranslations("owner"), getLocale()]);
  const st = await statement(id).catch(() => null);
  return {
    title: st
      ? t("statementTitle", {
          period: periodLabel(st.periodFrom, locale),
          property: st.propertyTitle,
        })
      : t("nav.statements"),
  };
}

/** "Why is my March payment lower?" answered line by line, without a phone call (spec 17 §17.7). */
export default async function OwnerStatement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const st = await statement(id);
  if (!st) notFound();
  return (
    <div className="space-y-4" data-testid="owner-statement-detail">
      <PageTitle>
        {periodLabel(st.periodFrom, locale)} · {st.propertyTitle}
      </PageTitle>
      <p className="text-sm">
        {t("netDue")}:{" "}
        <strong data-testid="owner-net-due">
          {money(Number(st.totals.netDue ?? 0), st.currency, locale)}
        </strong>{" "}
        · {t("state")}: {st.state === "paid" ? t("statePaid") : t("stateReady")}
        {st.pdfRef ? (
          <a
            className="ms-2 underline"
            href={st.pdfRef}
            download={`statement-${st.periodFrom.slice(0, 7)}.pdf`}
          >
            {t("download")}
          </a>
        ) : null}
      </p>
      <Card>
        <Table data-testid="owner-lines">
          <TBody>
            {st.lines.map((l) => (
              <Tr key={l.id}>
                <Td>{day(l.date, locale)}</Td>
                <Td>{l.description}</Td>
                <Td className="text-end tabular-nums">
                  {money(l.amountMinor, st.currency, locale)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="text-sm">
        {st.disputeState === "open" ? (
          <p className="text-danger" data-testid="dispute-open">
            {t("disputeOpen")}
          </p>
        ) : st.disputeState === "resolved" ? (
          <p className="text-success-soft-foreground">{t("disputeResolved")}</p>
        ) : (
          <form action={disputeStatementAction} className="space-y-2">
            <input type="hidden" name="id" value={st.id} />
            <p className="font-medium">{t("dispute")}</p>
            <p className="text-xs text-muted" id="dispute-hint">
              {t("disputeHint")}
            </p>
            <Label htmlFor="dispute-reason">{t("disputeReason")}</Label>
            <Textarea
              id="dispute-reason"
              name="reason"
              rows={3}
              required
              aria-describedby="dispute-hint"
              data-testid="dispute-reason"
            />
            <SubmitButton variant="danger" testId="send-dispute" pendingLabel={t("sendingDispute")}>
              {t("sendDispute")}
            </SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}
