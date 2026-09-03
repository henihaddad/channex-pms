import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
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
      <Card title={t("connections")}>
        <ul className="text-sm">
          {d.connections.map((c) => (
            <li key={c.id}>
              {c.adapterCode} · {c.state} · {c.lastPushAt?.slice(0, 16) ?? "—"}
              {c.lastError ? ` · ${c.lastError.slice(0, 120)}` : ""}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("operations")}>
        <Table data-testid="operations">
          <THead>
            <Tr>
              <Th>{t("kind")}</Th>
              <Th>{t("state")}</Th>
              <Th className="text-end">{t("attempts")}</Th>
              <Th className="text-end">{t("entries")}</Th>
              <Th className="text-end">{t("accepted")}</Th>
              <Th className="text-end">{t("rejected")}</Th>
              <Th className="text-end">{t("duration")}</Th>
              <Th>{t("requestId")}</Th>
              <Th>{t("error")}</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {d.operations.map((o) => (
              <Tr key={o.id} data-testid="operation-row" data-state={o.state}>
                <Td>{o.kind}</Td>
                <Td>{o.state}</Td>
                <Td className="text-end">{o.attempts}</Td>
                <Td className="text-end">{o.entries}</Td>
                <Td className="text-end">{o.accepted}</Td>
                <Td className="text-end">{o.rejected}</Td>
                <Td className="text-end">{o.durationMs ?? "—"}</Td>
                <Td>{o.requestId?.slice(0, 8) ?? "—"}</Td>
                <Td>{o.lastError?.slice(0, 80) ?? ""}</Td>
                <Td>
                  {o.state === "failed" || o.state === "dead" ? (
                    <form action={retryOperationAction}>
                      <input type="hidden" name="operationId" value={o.id} />
                      <button className="underline" type="submit">
                        {t("retry")}
                      </button>
                    </form>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card title={t("webhooks")}>
        <Table data-testid="inspector-webhooks">
          <TBody>
            {d.webhooks.map((w) => (
              <Tr key={w.id} data-state={w.state}>
                <Td>{w.event}</Td>
                <Td>{w.state}</Td>
                <Td>{w.receivedAt.slice(0, 19)}</Td>
                <Td>{w.dedupeKey.slice(0, 24)}</Td>
                <Td>{w.lastError?.slice(0, 60) ?? ""}</Td>
                <Td>
                  <form action={replayWebhookAction}>
                    <input type="hidden" name="webhookId" value={w.id} />
                    <button className="underline" type="submit">
                      {t("replay")}
                    </button>
                  </form>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      {d.unacked.length ? (
        <Card title={t("unacked")}>
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
