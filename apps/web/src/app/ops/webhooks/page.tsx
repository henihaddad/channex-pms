import { getTranslations } from "next-intl/server";
import { Button, Card, Input, PageTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { replayWebhookAction } from "../ops.actions";

const loadWebhooks = withOperator<
  [{ event?: string; state?: string }],
  Awaited<ReturnType<import("@pms/db").DrizzleOperatorRepository["webhooks"]>>
>("webhooks.read", { audit: false }, async (ctx, f) => ctx.repo.webhooks(f));

/** Webhook explorer (spec 12 §12.1): dedupe keys, states, replay. Payloads are never shown (OPCON-1). */
export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; state?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("ops");
  const rows = await guard(() => loadWebhooks(sp));
  return (
    <div className="space-y-4">
      <PageTitle>{t("webhooks")}</PageTitle>
      <form className="flex gap-2">
        <Input
          name="event"
          defaultValue={sp.event ?? ""}
          placeholder={t("event")}
          aria-label={t("event")}
        />
        <Input
          name="state"
          defaultValue={sp.state ?? ""}
          placeholder={t("state")}
          aria-label={t("state")}
        />
        <Button type="submit" variant="secondary">
          {t("search")}
        </Button>
      </form>
      <Card>
        <Table data-testid="webhook-explorer">
          <THead>
            <Tr>
              <Th>{t("event")}</Th>
              <Th>{t("state")}</Th>
              <Th className="text-end">{t("attempts")}</Th>
              <Th>{t("dedupe")}</Th>
              <Th>{t("received")}</Th>
              <Th>{t("error")}</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {rows.map((w) => (
              <Tr key={w.id} data-testid="webhook-row" data-state={w.state}>
                <Td>{w.event}</Td>
                <Td>{w.state}</Td>
                <Td className="text-end">{w.attempts}</Td>
                <Td>{w.dedupeKey.slice(0, 32)}</Td>
                <Td>{w.receivedAt.slice(0, 19)}</Td>
                <Td>{w.lastError?.slice(0, 60) ?? ""}</Td>
                <Td>
                  <form action={replayWebhookAction}>
                    <input type="hidden" name="webhookId" value={w.id} />
                    <button className="underline" type="submit" data-testid="replay-webhook">
                      {t("replay")}
                    </button>
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
