import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { disputeStatementAction, loadPortalStatement } from "../../portal.actions";

/** "Why is my March payment lower?" answered line by line, without a phone call (spec 17 §17.7). */
export default async function OwnerStatement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("owner");
  const st = await guard(() => loadPortalStatement({ id }));
  if (!st) notFound();
  return (
    <div className="space-y-4" data-testid="owner-statement-detail">
      <PageTitle>
        {st.periodFrom.slice(0, 7)} · {st.propertyTitle}
      </PageTitle>
      <p className="text-sm">
        {t("netDue")}:{" "}
        <strong data-testid="owner-net-due">
          {money(Number(st.totals.netDue ?? 0), st.currency)}
        </strong>{" "}
        · {t("state")}: {st.state}
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
        <table className="w-full text-xs" data-testid="owner-lines">
          <tbody>
            {st.lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-0.5 text-muted">{l.date}</td>
                <td>{l.description}</td>
                <td className="text-end tabular-nums">{money(l.amountMinor, st.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="text-sm">
        {st.disputeState === "open" ? (
          <p className="text-rose" data-testid="dispute-open">
            {t("disputeOpen")}
          </p>
        ) : st.disputeState === "resolved" ? (
          <p className="text-mint-deep">{t("disputeResolved")}</p>
        ) : (
          <form action={disputeStatementAction} className="space-y-2">
            <input type="hidden" name="id" value={st.id} />
            <p className="font-medium">{t("dispute")}</p>
            <p className="text-xs text-muted">{t("disputeHint")}</p>
            <textarea
              name="reason"
              rows={3}
              required
              placeholder={t("disputeReason")}
              className="w-full rounded border border-line-strong p-2 text-sm"
              data-testid="dispute-reason"
            />
            <Button type="submit" variant="danger" data-testid="send-dispute">
              {t("sendDispute")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
