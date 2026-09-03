import { getTranslations } from "next-intl/server";
import { Button, Card, Input, PageTitle, TBody, Table, Td, Tr } from "@/components/ui";
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
        <Table data-testid="dlq">
          <TBody>
            {rows.map((r) => (
              <Tr key={`${r.kind}:${r.id}`} data-testid="dlq-row" data-kind={r.kind}>
                <Td>{r.kind}</Td>
                <Td>{r.label}</Td>
                <Td>{r.attempts}</Td>
                <Td>{r.at.slice(0, 19)}</Td>
                <Td>{r.lastError?.slice(0, 80) ?? ""}</Td>
                <Td>
                  <form action={dlqAction} className="flex gap-1">
                    <input type="hidden" name="kind" value={r.kind} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="orgId" value={r.orgId} />
                    <Input name="reason" placeholder={t("discardReason")} className="w-40" />
                    <Button
                      type="submit"
                      name="op"
                      value="requeue"
                      variant="secondary"
                      data-testid="dlq-requeue"
                      size="sm"
                    >
                      {t("requeue")}
                    </Button>
                    <Button
                      type="submit"
                      name="op"
                      value="discard"
                      variant="secondary"

                      size="sm"
                    >
                      {t("discard")}
                    </Button>
                  </form>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
