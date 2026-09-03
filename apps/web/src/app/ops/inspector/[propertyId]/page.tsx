import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { forceResyncAction, replayWebhookAction, retryOperationAction } from "../../ops.actions";

const loadInspector = withOperator<
  [string],
  Awaited<ReturnType<import("@pms/db").DrizzleOperatorRepository["syncInspector"]>>
>("inspector.read", { audit: false }, async (ctx, propertyId) =>
  ctx.repo.syncInspector(propertyId),
);

/** The sync inspector (spec 12 §12.1): the tool that resolves "my rates are not updating" without database access or guest data. */
export default async function InspectorPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const t = await getTranslations("ops");
  const d = await guard(() => loadInspector(propertyId));
  if (!d.property) notFound();
  return (
    <div className="space-y-4" data-testid="sync-inspector">
      <PageTitle>
        {t("inspector")} · {d.property.title}
      </PageTitle>
      <p className="text-sm text-muted">
        {d.property.orgName} · {t("propertyId")} {d.property.id} · {d.property.state} ·{" "}
        {t("pendingCells")}: {d.pendingCells} · {t("unacked")}: {d.unacked.length}
      </p>
      <form action={forceResyncAction}>
        <input type="hidden" name="propertyId" value={propertyId} />
        <Button type="submit" variant="secondary" data-testid="force-resync">
          {t("forceResync")}
        </Button>
      </form>
      <Card>
        <h2 className="mb-2 font-semibold">{t("connections")}</h2>
        <ul className="text-sm">
          {d.connections.map((c) => (
            <li key={c.id}>
              {c.adapterCode} · {c.state} · {c.lastPushAt?.slice(0, 16) ?? "—"}
              {c.lastError ? ` · ${c.lastError.slice(0, 120)}` : ""}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("operations")}</h2>
        <table className="w-full text-xs" data-testid="operations">
          <thead className="text-muted">
            <tr>
              <th className="text-start">{t("kind")}</th>
              <th className="text-start">{t("state")}</th>
              <th className="text-end">{t("attempts")}</th>
              <th className="text-end">{t("entries")}</th>
              <th className="text-end">{t("accepted")}</th>
              <th className="text-end">{t("rejected")}</th>
              <th className="text-end">{t("duration")}</th>
              <th className="text-start">{t("requestId")}</th>
              <th className="text-start">{t("error")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.operations.map((o) => (
              <tr key={o.id} data-testid="operation-row" data-state={o.state}>
                <td>{o.kind}</td>
                <td>{o.state}</td>
                <td className="text-end">{o.attempts}</td>
                <td className="text-end">{o.entries}</td>
                <td className="text-end">{o.accepted}</td>
                <td className="text-end">{o.rejected}</td>
                <td className="text-end">{o.durationMs ?? "—"}</td>
                <td>{o.requestId?.slice(0, 8) ?? "—"}</td>
                <td>{o.lastError?.slice(0, 80) ?? ""}</td>
                <td>
                  {o.state === "failed" || o.state === "dead" ? (
                    <form action={retryOperationAction}>
                      <input type="hidden" name="operationId" value={o.id} />
                      <button className="underline" type="submit">
                        {t("retry")}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("webhooks")}</h2>
        <table className="w-full text-xs" data-testid="inspector-webhooks">
          <tbody>
            {d.webhooks.map((w) => (
              <tr key={w.id} data-state={w.state}>
                <td>{w.event}</td>
                <td>{w.state}</td>
                <td>{w.receivedAt.slice(0, 19)}</td>
                <td>{w.dedupeKey.slice(0, 24)}</td>
                <td>{w.lastError?.slice(0, 60) ?? ""}</td>
                <td>
                  <form action={replayWebhookAction}>
                    <input type="hidden" name="webhookId" value={w.id} />
                    <button className="underline" type="submit">
                      {t("replay")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {d.unacked.length ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t("unacked")}</h2>
          <ul className="text-xs">
            {d.unacked.map((u) => (
              <li key={u.revisionId}>
                {u.systemId} · {u.receivedAt.slice(0, 19)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
