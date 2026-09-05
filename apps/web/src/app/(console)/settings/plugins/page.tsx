import { getTranslations } from "next-intl/server";
import { Button, Card, SectionTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { InstallForm } from "./install-form";
import { loadPlugins, retryDeliveriesAction, setPluginEnabledAction } from "./plugins.actions";

/** Plugins (spec 12 §12.7, ADR-0004): install with an explicit permission grant, enable, retry, watch deliveries. */
export default async function PluginsPage() {
  const t = await getTranslations("plugins");
  const { plugins, deliveries } = await guard(() => loadPlugins());
  return (
    <div className="space-y-6">
      <SectionTitle>{t("title")}</SectionTitle>
      <p className="text-sm text-muted">{t("hint")}</p>
      <Card title={t("installed")}>
        {plugins.length === 0 ? <p className="text-sm text-muted">{t("none")}</p> : null}
        <ul className="space-y-2 text-sm" data-testid="plugin-list">
          {plugins.map((p) => (
            <li
              key={p.id}
              className="rounded border border-border p-2"
              data-testid="plugin-row"
              data-enabled={p.enabled ? "1" : "0"}
            >
              <div className="flex items-center justify-between">
                <strong>
                  {p.manifest.name}{" "}
                  <span className="text-xs text-muted">v{p.manifest.version}</span>
                </strong>
                <span className="text-xs">
                  {p.enabled ? t("enabled") : t("disabled")}
                  {p.breakerOpenUntil
                    ? ` · ${t("breaker", { time: p.breakerOpenUntil.slice(11, 16) })}`
                    : ""}
                </span>
              </div>
              <p className="text-xs text-muted">
                {t("events")}: {p.manifest.events.join(", ")} · {t("extensionPoints")}:{" "}
                {p.manifest.extensionPoints.join(", ")}
              </p>
              <p className="text-xs text-muted">
                {t("permissions")}:{" "}
                {p.manifest.permissions.length ? p.manifest.permissions.join(", ") : "—"} ·{" "}
                {p.endpointUrl}
              </p>
              <div className="mt-1 flex gap-2">
                <form action={setPluginEnabledAction}>
                  <input type="hidden" name="pluginId" value={p.id} />
                  <input type="hidden" name="enabled" value={p.enabled ? "0" : "1"} />
                  <Button type="submit" variant="secondary" data-testid="toggle-plugin" size="sm">
                    {p.enabled ? t("disable") : t("enable")}
                  </Button>
                </form>
                <form action={retryDeliveriesAction}>
                  <input type="hidden" name="pluginId" value={p.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {t("retry")}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("install")}>
        <InstallForm
          labels={{
            endpoint: t("endpoint"),
            manifest: t("manifest"),
            install: t("installButton"),
            secret: t("secret", { secret: "{secret}" }),
          }}
        />
        <p className="mt-2 text-xs text-muted">{t("reference")}</p>
      </Card>
      <Card title={t("deliveries")}>
        <Table data-testid="deliveries">
          <THead>
            <Tr>
              <Th>{t("delivery")}</Th>
              <Th>{t("events")}</Th>
              <Th>{t("state")}</Th>
              <Th className="text-end">{t("attempts")}</Th>
            </Tr>
          </THead>
          <TBody>
            {deliveries.map((d) => (
              <Tr key={d.id} data-testid="delivery-row" data-state={d.state}>
                <Td>{d.pluginKey}</Td>
                <Td>{d.eventType}</Td>
                <Td>
                  {d.state}
                  {d.lastError ? ` (${d.lastError})` : ""}
                </Td>
                <Td className="text-end">{d.attempts}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
