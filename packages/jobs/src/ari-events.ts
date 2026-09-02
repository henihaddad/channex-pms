import type { Id } from "@pms/core";
import { enqueueOutbox, rawRows, sql, type Tx } from "@pms/db";

/** Queue a coalesced push for a property (3 s bucket, spec 05 §5.4.4). Same key as the availability deriver. */
export async function queueAriPush(
  tx: Tx,
  orgId: string,
  propertyId: string,
  nowMs: number,
  source: string,
): Promise<void> {
  await enqueueOutbox(tx, {
    type: "ari.changed",
    orgId: orgId as Id,
    aggregate: { kind: "property", id: propertyId as Id },
    payload: { propertyId, source },
    occurredAt: new Date(nowMs).toISOString(),
    dedupeKey: `ari.changed:${propertyId}:${String(Math.floor(nowMs / 3000))}`,
  });
}

/** CH-6 / provisioning: every cell back to pending so the next push covers the whole horizon. */
export async function markAllPending(tx: Tx, propertyId: string): Promise<number> {
  const a = await tx.execute(
    sql`update rate_day set sync_state = 'pending', version = version + 1, updated_at = now() where property_id = ${propertyId} and sync_state <> 'pending'`,
  );
  const b = await tx.execute(
    sql`update availability_day set sync_state = 'pending', version = version + 1, updated_at = now() where property_id = ${propertyId} and sync_state <> 'pending'`,
  );
  return (
    Number((a as { rowCount?: number }).rowCount ?? 0) +
    Number((b as { rowCount?: number }).rowCount ?? 0)
  );
}

export async function pendingCellCount(tx: Tx, propertyId: string): Promise<number> {
  const [r] = await rawRows<{ n: number }>(
    tx,
    sql`select ((select count(*) from rate_day where property_id = ${propertyId} and sync_state in ('pending','in_flight','failed','conflicted'))
      + (select count(*) from availability_day where property_id = ${propertyId} and sync_state in ('pending','in_flight','failed','conflicted')))::int as n`,
  );
  return r?.n ?? 0;
}

/** Organizations that have properties in the given states; the worker iterates tenants this way. */
export async function orgsWithProperties(db: Tx, states: readonly string[]): Promise<string[]> {
  const rows = await rawRows<{ org_id: string }>(
    db,
    sql`select distinct org_id from property where archived_at is null and state in (${sql.join(
      states.map((s) => sql`${s}`),
      sql`, `,
    )})`,
  );
  return rows.map((r) => r.org_id);
}
