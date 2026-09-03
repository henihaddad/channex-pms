import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadConnection } from "../channels.actions";
import { ConnectionMapping } from "./connection-mapping";
import { ActivateButton } from "./activate-button";

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await guard(() => loadConnection(id));
  return (
    <div className="space-y-6">
      <PageTitle>
        {v.connection.propertyTitle} · {v.connection.adapterCode}
      </PageTitle>
      <Card>
        <p className="text-sm text-muted">
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
