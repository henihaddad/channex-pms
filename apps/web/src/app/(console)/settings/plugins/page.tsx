import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { InstallForm } from "./install-form";
import { loadPlugins, retryDeliveriesAction, setPluginEnabledAction } from "./plugins.actions";

/** Plugins (spec 12 §12.7, ADR-0004): install with an explicit permission grant, enable, retry, watch deliveries. */
export default async function PluginsPage() {
  const t = await getTranslations("plugins");
  const { plugins, deliveries } = await guard(() => loadPlugins());
  return (
    <div className="space-y-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-sm text-muted">{t("hint")}</p>
      <Card>
        <h2 className="mb-2 font-semibold">{t("installed")}</h2>
        {plugins.length === 0 ? <p className="text-sm text-muted">{t("none")}</p> : null}
        <ul className="space-y-2 text-sm" data-testid="plugin-list">
          {plugins.map((p) => (
            <li
              key={p.id}
              className="rounded border border-line p-2"
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
                  <Button
                    type="submit"
                    variant="secondary"
                    className="h-7 text-xs"
                    data-testid="toggle-plugin"
                  >
                    {p.enabled ? t("disable") : t("enable")}
                  </Button>
                </form>
                <form action={retryDeliveriesAction}>
                  <input type="hidden" name="pluginId" value={p.id} />
                  <Button type="submit" variant="secondary" className="h-7 text-xs">
                    {t("retry")}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("install")}</h2>
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
      <Card>
        <h2 className="mb-2 font-semibold">{t("deliveries")}</h2>
        <table className="w-full text-xs" data-testid="deliveries">
          <thead className="text-muted">
            <tr>
              <th className="text-start">{t("delivery")}</th>
              <th className="text-start">{t("events")}</th>
              <th className="text-start">{t("state")}</th>
              <th className="text-end">{t("attempts")}</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id} data-testid="delivery-row" data-state={d.state}>
                <td>{d.pluginKey}</td>
                <td>{d.eventType}</td>
                <td>
                  {d.state}
                  {d.lastError ? ` (${d.lastError})` : ""}
                </td>
                <td className="text-end">{d.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
