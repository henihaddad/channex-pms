import { getTranslations } from "next-intl/server";
import { Button, Card, Input, PageTitle } from "@/components/ui";
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
        <table className="w-full text-xs" data-testid="webhook-explorer">
          <thead className="text-slate-500">
            <tr>
              <th className="text-start">{t("event")}</th>
              <th className="text-start">{t("state")}</th>
              <th className="text-end">{t("attempts")}</th>
              <th className="text-start">{t("dedupe")}</th>
              <th className="text-start">{t("received")}</th>
              <th className="text-start">{t("error")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} data-testid="webhook-row" data-state={w.state}>
                <td>{w.event}</td>
                <td>{w.state}</td>
                <td className="text-end">{w.attempts}</td>
                <td>{w.dedupeKey.slice(0, 32)}</td>
                <td>{w.receivedAt.slice(0, 19)}</td>
                <td>{w.lastError?.slice(0, 60) ?? ""}</td>
                <td>
                  <form action={replayWebhookAction}>
                    <input type="hidden" name="webhookId" value={w.id} />
                    <button className="underline" type="submit" data-testid="replay-webhook">
                      {t("replay")}
                    </button>
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
