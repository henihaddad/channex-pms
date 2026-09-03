import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";

const loadFleet = withOperator("fleet.read", { audit: false }, async (ctx) =>
  ctx.repo.fleetHealth(),
);

/** Fleet health (spec 12 §12.1): queues, failures, lag, unacked bookings, pending cells, worst properties. */
export default async function FleetPage() {
  const t = await getTranslations("ops");
  const h = await guard(() => loadFleet());
  const rows: Array<[string, number, string]> = [
    [t("outboxUnpublished"), h.outboxUnpublished, "outbox"],
    [t("syncQueued"), h.syncQueued, "sync-queued"],
    [t("syncFailed"), h.syncFailed, "sync-failed"],
    [t("syncDead"), h.syncDead, "sync-dead"],
    [t("webhooksPending"), h.webhooksPending, "webhooks-pending"],
    [t("webhookLag"), h.webhookLagSeconds, "webhook-lag"],
    [t("unacked"), h.unackedBookings, "unacked"],
    [t("pendingCells"), h.pendingCells, "pending-cells"],
    [t("p429"), h.provider429Last24h, "p429"],
    [t("providerErrors"), h.providerErrorsLast24h, "provider-errors"],
    [t("pluginDead"), h.pluginDeliveriesDead, "plugin-dead"],
  ];
  return (
    <div className="space-y-6">
      <PageTitle>{t("fleet")}</PageTitle>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="fleet-health">
        {rows.map(([label, value, id]) => (
          <Card key={id} data-testid={`fleet-${id}`}>
            <p className="text-xs text-muted">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">{t("worst")}</h2>
        <ul className="text-sm">
          {h.worstProperties.map((p) => (
            <li key={p.propertyId}>
              <Link href={`/ops/inspector/${p.propertyId}`} className="underline">
                {p.title}
              </Link>{" "}
              · {p.orgName} · {p.pendingCells} {t("pendingCells").toLowerCase()} · {p.unacked}{" "}
              {t("unacked").toLowerCase()}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
