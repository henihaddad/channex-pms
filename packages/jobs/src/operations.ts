import {
  credentialActionForDiff,
  credentialWindow,
  dueEscalations,
  Id,
  LocalDate,
  type Clock,
  type Crypto,
  type DomainEvent,
  type LockProvider,
  type RevisionDiff,
} from "@pms/core";
import {
  asSystem,
  claimEvent,
  DrizzleBillingRepository,
  DrizzleOperationsRepository,
  enqueueOutbox,
  rawRows,
  sql,
  withoutTenant,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";

export interface OpsDeps {
  db: Db;
  clock: Clock;
  crypto: Crypto;
  lock: LockProvider;
  log: Logger;
  /** Where notifications go (OPS-3, OPS-4); the outbox carries them to notify.deliver. */
  notify?: (
    tx: Tx,
    orgId: string,
    n: { kind: string; to: string | null; text: string; ref: Record<string, unknown> },
  ) => Promise<void>;
}

export const PLAN_WINDOW_DAYS = 400;

async function notify(
  deps: OpsDeps,
  tx: Tx,
  orgId: string,
  n: { kind: string; to: string | null; text: string; ref: Record<string, unknown> },
): Promise<void> {
  if (deps.notify) return deps.notify(tx, orgId, n);
  await enqueueOutbox(tx, {
    type: `notify.${n.kind}`,
    orgId: orgId as Id,
    aggregate: { kind: "notification", id: Id.next() },
    payload: n,
    occurredAt: deps.clock.now().toString(),
    dedupeKey: `notify:${n.kind}:${JSON.stringify(n.ref)}:${String(deps.clock.now().epochMilliseconds)}`,
  });
}

/**
 * Consumer of booking.revision_applied for operations (RES-4, OPS-1, OPS-3, INV-14):
 * re-plan the property's turnover tasks, tell assignees what changed, and revoke
 * or reissue access credentials when the stay was cancelled or its dates moved.
 */
export async function replanOperations(
  deps: OpsDeps,
  event: DomainEvent,
): Promise<{ created: number; cancelled: number; changed: number; credentials: string }> {
  const payload = event.payload as { propertyId: string; bookingId?: string; diff: RevisionDiff };
  return asSystem(deps.db, event.orgId, async (tx) => {
    if (!(await claimEvent(tx, event.orgId, "ops.replan", event.dedupeKey)))
      return { created: 0, cancelled: 0, changed: 0, credentials: "skipped" };
    const ops = new DrizzleOperationsRepository(tx, event.orgId);
    const [prop] = await rawRows<{
      timezone: string;
      check_in: string | null;
      check_out: string | null;
    }>(
      tx,
      sql`select p.timezone, (select check_in_time from policy where property_id = p.id limit 1) as check_in, (select check_out_time from policy where property_id = p.id limit 1) as check_out from property p where p.id = ${payload.propertyId}`,
    );
    const today = deps.clock.today(prop?.timezone ?? "UTC");
    const r = await ops.replan(
      payload.propertyId,
      today.minusDays(1).toString(),
      today.plusDays(PLAN_WINDOW_DAYS).toString(),
      { checkInTime: prop?.check_in ?? "15:00", checkOutTime: prop?.check_out ?? "10:00" },
    );
    for (const c of r.changed)
      if (c.assigneeId)
        await notify(deps, tx, event.orgId, {
          kind: "task_changed",
          to: c.assigneeId,
          text: `A turnover you are assigned to changed: ${c.change}`,
          ref: { taskId: c.id },
        });
    // INV-14: the credential follows the stay
    let credentials = "none";
    const bookingId = payload.bookingId ?? (await bookingIdFromEvent(tx, event));
    if (bookingId) {
      const active = await ops.activeCredentials(bookingId);
      const action = credentialActionForDiff(payload.diff, active.length > 0);
      if (action !== "none") {
        for (const c of active) {
          await deps.lock.revoke({
            unitRef: c.unitId ?? payload.propertyId,
            providerRef: c.providerRef,
          });
          await ops.revokeCredential(
            c.id,
            action === "revoke" ? "booking cancelled" : "dates changed",
          );
        }
        if (action === "reissue") {
          const [b] = await rawRows<{ arrival_date: string; departure_date: string }>(
            tx,
            sql`select arrival_date::text, departure_date::text from booking where id = ${bookingId}`,
          );
          if (b)
            for (const c of active)
              await issueCredential(deps, tx, event.orgId, {
                propertyId: payload.propertyId,
                bookingId,
                unitId: c.unitId,
                type: c.type,
                timezone: prop?.timezone ?? "UTC",
                arrivalDate: b.arrival_date,
                departureDate: b.departure_date,
                issuedBy: "system:inv-14",
              });
        }
        credentials = action;
      }
    }
    deps.log.info(
      {
        orgId: event.orgId,
        propertyId: payload.propertyId,
        ...r,
        changed: r.changed.length,
        credentials,
      },
      "ops.replan.done",
    );
    return { created: r.created, cancelled: r.cancelled, changed: r.changed.length, credentials };
  });
}

async function bookingIdFromEvent(tx: Tx, event: DomainEvent): Promise<string | null> {
  if (event.aggregate.kind === "booking") {
    const [b] = await rawRows<{ id: string }>(
      tx,
      sql`select id from booking where channex_booking_id = ${event.aggregate.id} or id::text = ${event.aggregate.id} limit 1`,
    );
    return b?.id ?? null;
  }
  return null;
}

/** Issue a credential through the lock port and seal it; the plain value never leaves this function except to the caller who displays it once. */
export async function issueCredential(
  deps: OpsDeps,
  tx: Tx,
  orgId: string,
  input: {
    propertyId: string;
    bookingId: string;
    unitId: string | null;
    type: "door_code" | "lockbox" | "smart_lock" | "key_handover";
    timezone: string;
    arrivalDate: string;
    departureDate: string;
    issuedBy: string;
  },
): Promise<{ id: string; value: string; validFrom: string; validTo: string }> {
  const window = credentialWindow({
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    timezone: input.timezone,
  });
  const issued = await deps.lock.issue({
    unitRef: input.unitId ?? input.propertyId,
    bookingId: input.bookingId,
    window,
    type: input.type,
  });
  const id = Id.next();
  await new DrizzleOperationsRepository(tx, orgId).insertCredential({
    id,
    propertyId: input.propertyId,
    bookingId: input.bookingId,
    unitId: input.unitId,
    type: input.type,
    valueEnc: await deps.crypto.seal(issued.value),
    value: issued.value,
    window,
    providerRef: issued.providerRef,
    issuedBy: input.issuedBy,
  });
  return { id, value: issued.value, ...window };
}

/** OPS-4 every minute: escalate unassigned same-day changeovers; each level notifies once. */
export async function escalateTurnovers(deps: OpsDeps): Promise<{ escalated: number }> {
  const orgs = await withoutTenant(deps.db, (tx) =>
    rawRows<{ org_id: string }>(
      tx,
      sql`select distinct org_id from turnover_task where is_same_day and assignee_id is null and state in ('planned','assigned') and date >= current_date - 1`,
    ),
  );
  let escalated = 0;
  for (const { org_id: orgId } of orgs) {
    await asSystem(deps.db, orgId, async (tx) => {
      const ops = new DrizzleOperationsRepository(tx, orgId);
      const open = await ops.openSameDayTasks();
      for (const e of dueEscalations(open, deps.clock.now().toString())) {
        const cur = (e.task as (typeof open)[number]).escalatedLevel;
        if (cur === e.level || cur === "property_manager") continue;
        await ops.markEscalated(e.task.id, e.level);
        await notify(deps, tx, orgId, {
          kind: "turnover_escalation",
          to: null,
          text: `Same-day changeover on ${e.task.date} has no cleaner; ${String(Math.max(0, e.minutesLeft))} minutes left in its window (${e.level.replace("_", " ")})`,
          ref: { taskId: e.task.id, level: e.level },
        });
        escalated++;
      }
    });
  }
  if (escalated) deps.log.warn({ escalated }, "ops.escalated");
  return { escalated };
}

/** Daily close per property once its local day has rolled (spec 08 §8.9); idempotent. */
export async function runDailyCloses(
  deps: Pick<OpsDeps, "db" | "clock" | "log">,
): Promise<{ closed: number }> {
  const props = await withoutTenant(deps.db, (tx) =>
    rawRows<{ org_id: string; id: string; timezone: string }>(
      tx,
      sql`select org_id, id, timezone from property where archived_at is null and state in ('live','syncing')`,
    ),
  );
  let closed = 0;
  for (const p of props) {
    const yesterday = deps.clock.today(p.timezone).minusDays(1);
    const n = await asSystem(deps.db, p.org_id, async (tx) => {
      const billing = new DrizzleBillingRepository(tx, p.org_id);
      const last = await billing.lastClose(p.id);
      let d = last ? LocalDate.parse(last).plusDays(1) : yesterday;
      if (yesterday.daysUntil(d) > 0) return 0;
      let done = 0;
      for (let i = 0; !d.isAfter(yesterday) && i < 31; d = d.plusDays(1), i++) {
        await billing.closeDay(p.id, d.toString());
        done++;
      }
      return done;
    });
    closed += n;
  }
  deps.log.info({ closed }, "daily_close.run");
  return { closed };
}

/** PCI-4: card metadata is purged after the retention window; the sweep is monitored and its failure is a P1. */
export async function purgeCardMetadata(
  deps: Pick<OpsDeps, "db" | "clock" | "log">,
  retentionDays = 30,
): Promise<{ purged: number }> {
  const r = await withoutTenant(deps.db, (tx) =>
    tx.execute(sql`update payment_instrument set masked_number = null, expiry = null, cardholder = null, provider_token_ref = null, vcc_balance_minor = null, purge_after = now()
    where purge_after is null and created_at < now() - make_interval(days => ${retentionDays}::int) and booking_id in (select id from booking where departure_date < current_date - ${retentionDays}::int)`),
  );
  const purged = Number((r as { rowCount?: number }).rowCount ?? 0);
  deps.log.info({ purged }, "retention.card_metadata");
  return { purged };
}
