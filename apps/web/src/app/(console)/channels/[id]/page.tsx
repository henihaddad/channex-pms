import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadConnection } from "../channels.actions";
import { ConnectionMapping } from "./connection-mapping";

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await guard(() => loadConnection(id));
  return (
    <div className="space-y-6">
      <PageTitle>
        {v.connection.propertyTitle} · {v.connection.adapterCode}
      </PageTitle>
      <Card>
        <p className="text-sm text-slate-600">
          State {v.connection.state} ·{" "}
          {v.connection.readiness.ready
            ? "ready"
            : `not ready: ${v.connection.readiness.issues.join("; ")}`}{" "}
          · Channex channel {v.connection.channexChannelId ?? "—"}
        </p>
        <p className="text-xs text-slate-500">
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
      <Card>
        <h2 className="mb-2 font-semibold">Events</h2>
        <ul className="text-sm">
          {v.events.map((e) => (
            <li key={e.id} className="border-t border-slate-100 py-1">
              <span className="me-2 text-[10px] uppercase text-slate-500">{e.severity}</span>
              {e.message}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
