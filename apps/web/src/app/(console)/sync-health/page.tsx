import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadSyncHealth } from "./sync-health.actions";

const STATES = ["pending", "in_flight", "synced", "failed", "conflicted"] as const;

export default async function SyncHealthPage() {
  const rows = await guard(() => loadSyncHealth());
  return (
    <div className="space-y-6">
      <PageTitle>Sync health</PageTitle>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No properties yet.</p>
        </Card>
      ) : null}
      {rows.map((p) => (
        <Card key={p.propertyId}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{p.title}</h2>
            <span className="text-xs text-muted">{p.state}</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            {STATES.map((s) => (
              <div key={s}>
                <dt className="text-xs uppercase text-muted">{s}</dt>
                <dd
                  className={`font-mono ${s === "failed" || s === "conflicted" ? (p.cells[s] ? "text-rose" : "") : ""}`}
                >
                  {p.cells[s] ?? 0}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs uppercase text-muted">unacked</dt>
              <dd className={`font-mono ${p.unackedBookings ? "text-rose" : ""}`}>
                {p.unackedBookings}
              </dd>
            </div>
          </dl>
        </Card>
      ))}
    </div>
  );
}
