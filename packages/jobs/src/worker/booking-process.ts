import type { Clock, ConnectivityProvider, Crypto, IngestAlerts } from "@pms/core";
import { ackSweep, ingestProperty } from "@pms/core";
import { BookingRepositoryPerCall, rawRows, sql, type Db } from "@pms/db";
import type { Logger } from "@pms/runtime";

export interface BookingDeps {
  db: Db;
  provider: ConnectivityProvider;
  crypto: Crypto;
  clock: Clock;
  log: Logger;
  alerts?: IngestAlerts;
}

export interface BookingProcessJob {
  orgId: string;
  propertyId: string;
  reason: "webhook" | "poll" | "manual";
}

/** booking.process: pull the feed for one property and run the ack loop (spec 05 §5.6). */
export async function processBookings(
  deps: BookingDeps,
  data: BookingProcessJob,
  jobId: string,
): Promise<void> {
  const repo = new BookingRepositoryPerCall(deps.db, data.orgId, deps.crypto);
  const summary = await ingestProperty(
    {
      provider: deps.provider,
      repo,
      clock: deps.clock,
      orgId: data.orgId,
      log: deps.log,
      ...(deps.alerts ? { alerts: deps.alerts } : {}),
    },
    data.propertyId,
    { dedupeKey: `booking.process:${jobId}`, requestId: `job:${jobId}` },
  );
  deps.log.info(
    { orgId: data.orgId, propertyId: data.propertyId, reason: data.reason, ...summary },
    "booking.process.done",
  );
}

/** booking.ack_sweep: every minute, every org (BK-3). */
export async function processAckSweep(deps: BookingDeps, jobId: string): Promise<void> {
  const orgs = await rawRows<{ id: string }>(
    deps.db,
    sql`select id from organization where state <> 'offboarding'`,
  );
  for (const o of orgs) {
    const repo = new BookingRepositoryPerCall(deps.db, o.id, deps.crypto);
    const r = await ackSweep(
      {
        provider: deps.provider,
        repo,
        clock: deps.clock,
        orgId: o.id,
        log: deps.log,
        ...(deps.alerts ? { alerts: deps.alerts } : {}),
      },
      { dedupeKey: `ack.sweep:${jobId}:${o.id}`, requestId: `job:${jobId}` },
    );
    if (r.reacked || r.alerted || r.failed)
      deps.log.warn({ orgId: o.id, ...r }, "booking.ack_sweep");
  }
}

/** Polling reconciler (HOOK-6): bookings every minute regardless of webhooks. */
export async function livePropertyIds(
  db: Db,
): Promise<Array<{ orgId: string; propertyId: string }>> {
  const rows = await rawRows<{ org_id: string; id: string }>(
    db,
    sql`select org_id, id from property where state in ('syncing','live') and archived_at is null`,
  );
  return rows.map((r) => ({ orgId: r.org_id, propertyId: r.id }));
}
