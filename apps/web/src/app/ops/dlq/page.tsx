import { getTranslations } from "next-intl/server";
import { Button, Card, Input, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { dlqAction } from "../ops.actions";

const loadDlq = withOperator("dlq.read", { audit: false }, async (ctx) => ctx.repo.deadLetters());

/** Dead letters (spec 12 §12.1): inspect, requeue, discard with a reason. */
export default async function DlqPage() {
  const t = await getTranslations("ops");
  const rows = await guard(() => loadDlq());
  return (
    <div className="space-y-4">
      <PageTitle>{t("dlq")}</PageTitle>
      <Card>
        <table className="w-full text-xs" data-testid="dlq">
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}:${r.id}`} data-testid="dlq-row" data-kind={r.kind}>
                <td>{r.kind}</td>
                <td>{r.label}</td>
                <td>{r.attempts}</td>
                <td>{r.at.slice(0, 19)}</td>
                <td>{r.lastError?.slice(0, 80) ?? ""}</td>
                <td>
                  <form action={dlqAction} className="flex gap-1">
                    <input type="hidden" name="kind" value={r.kind} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="orgId" value={r.orgId} />
                    <Input
                      name="reason"
                      placeholder={t("discardReason")}
                      className="h-7 w-40 text-xs"
                    />
                    <Button
                      type="submit"
                      name="op"
                      value="requeue"
                      variant="secondary"
                      className="h-7 text-xs"
                      data-testid="dlq-requeue"
                    >
                      {t("requeue")}
                    </Button>
                    <Button
                      type="submit"
                      name="op"
                      value="discard"
                      variant="secondary"
                      className="h-7 text-xs"
                    >
                      {t("discard")}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
