import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, DataTable, EmptyState, PageHeader, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../../properties/properties.actions";
import { channexScreenAction, loadHealthBoard, syncConnectionsAction } from "../channels.actions";

/**
 * Channels that only the provider can authorise (Airbnb's OAuth, CH-5) are
 * connected inside Channex's own screen, embedded here and clearly labelled;
 * "pull" mirrors what Channex holds into our connections.
 */
export default async function ConnectViaChannexPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("channels");
  const [properties, board] = await guard(() => Promise.all([listProperties(), loadHealthBoard()]));
  const live = properties.filter((p) => p.state === "live");
  const propertyId = sp.propertyId ?? live[0]?.id ?? properties[0]?.id;
  const screen = propertyId ? await guard(() => channexScreenAction({ propertyId })) : null;
  const mirrored = board.connections.filter(
    (c) => c.propertyId === propertyId && c.channexChannelId,
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("connectScreenTitle")} description={t("connectScreenHint")} />
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Select
            name="propertyId"
            label={t("property")}
            defaultValue={propertyId ?? ""}
            className="w-80"
            testId="connect-property"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.state !== "live" ? ` (${p.state})` : ""}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("property")}
          </Button>
        </form>
      </Card>
      {screen ? (
        <Card
          title="Channex"
          description={t("connectScreenHint")}
          actions={
            <a
              href={screen.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent hover:underline"
            >
              {t("openInChannex")}
            </a>
          }
          contentClassName="overflow-hidden rounded-2xl"
        >
          <iframe
            src={screen.url}
            title="Channex"
            className="h-[70vh] w-full rounded-2xl border border-border bg-surface"
            data-testid="channex-screen"
          />
        </Card>
      ) : null}
      {propertyId ? (
        <Card
          title={t("mirrored")}
          actions={
            <form action={syncConnectionsAction}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <Button type="submit" variant="secondary" size="sm" data-testid="sync-connections">
                {t("syncConnections")}
              </Button>
            </form>
          }
        >
          {mirrored.length === 0 ? (
            <EmptyState title={t("noMirrored")} />
          ) : (
            <DataTable
              columns={["Channel", "State", "Ready"]}
              rowTestId="mirrored-connection"
              rows={mirrored.map((c) => [
                <a key="l" href={`/channels/${c.id}`} className="font-medium hover:underline">
                  {c.adapterCode}
                </a>,
                <Chip
                  key="s"
                  color={
                    c.state === "active" ? "success" : c.state === "error" ? "danger" : "accent"
                  }
                  size="sm"
                >
                  {c.state}
                </Chip>,
                c.ready ? "✓" : (c.readiness?.issues ?? []).join("; ") || "—",
              ])}
              dense
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}
