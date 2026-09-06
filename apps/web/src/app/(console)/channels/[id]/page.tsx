import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadConnection } from "../channels.actions";
import { ConnectionMapping } from "./connection-mapping";
import { ActivateButton } from "./activate-button";
import { AirbnbImport } from "../airbnb-import";
import { listPropertiesBrief } from "../channels.actions";

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await guard(() => loadConnection(id));
  const t = await getTranslations("channels");
  return (
    <div className="space-y-6">
      <PageTitle>
        {v.connection.propertyTitle} · {v.connection.adapterCode}
      </PageTitle>
      <Card>
        <p
          className="text-sm text-muted"
          data-testid="connection-state"
          data-state={v.connection.state}
        >
          State {v.connection.state} ·{" "}
          {v.connection.readiness.ready
            ? "ready"
            : `not ready: ${v.connection.readiness.issues.join("; ")}`}{" "}
          · Channex channel {v.connection.channexChannelId ?? "—"}
        </p>
        <p className="text-xs text-muted">
          Settings:{" "}
          {Object.entries(v.connection.settings)
            .map(([k, val]) => `${k}=${val}`)
            .join(", ") || "—"}{" "}
          · secrets shown as •••• (CH-2)
        </p>
      </Card>
      {v.connection.adapterCode === "AirBNB" && v.connection.settings.managedIn === "channex" ? (
        <Card title={t("importTitle")}>
          <AirbnbImport
            connectionId={v.connection.id}
            properties={await listPropertiesBrief()}
            labels={{
              load: t("importLoad"),
              hint: t("importHint"),
              none: t("importNone"),
              newProperty: t("importNew"),
              target: t("importTarget"),
              run: t("importRun"),
              done: t("importDone"),
            }}
          />
        </Card>
      ) : null}
      <Card>
        <ConnectionMapping view={v} />
      </Card>
      {v.connection.state !== "active" && v.connection.state !== "removed" ? (
        <Card title="Activate">
          <p className="mb-3 text-sm text-muted">
            Save the mappings first. Activation checks readiness, then pushes the full horizon.
          </p>
          <ActivateButton connectionId={v.connection.id} label="Activate connection" />
        </Card>
      ) : null}
      <Card title={"Events"}>
        <ul className="text-sm">
          {v.events.map((e) => (
            <li key={e.id} className="border-t border-border py-1">
              <span className="me-2 text-xs uppercase text-muted">{e.severity}</span>
              {e.message}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
