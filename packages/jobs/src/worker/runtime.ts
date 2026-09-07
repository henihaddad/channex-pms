import type {
  BillingProvider,
  Clock,
  ConnectivityProvider,
  Crypto,
  DomainEvent,
  LockProvider,
  Mailer,
  PaymentProvider,
  PayoutProvider,
} from "@pms/core";
import { withIdMap } from "@pms/connectivity";
import { asSystem, DrizzlePropertyRepository, rawRows, sql, withoutTenant, type Db } from "@pms/db";
import { QUEUES, type Logger, type QueueName } from "@pms/runtime";
import type { CircuitBreaker, RateLimiter } from "@pms/sync";
import {
  computeAlertsForAll,
  nightlyRollups,
  reconcileStatements,
  sendScheduledReports,
  snapshotSource,
} from "../analytics.js";
import { expireHolds, sendAbandonmentMails } from "../booking-engine.js";
import { collectDuePayments } from "../payments.js";
import { pollChannelHealth } from "../channels.js";
import { extendHorizons } from "../horizon.js";
import {
  closeThreadRemote,
  deliverOutbound,
  orgsWithAutomation,
  pollReviews,
  pollThreads,
  runAutomation,
  syncReviews,
  syncThreads,
} from "../messaging.js";
import {
  escalateTurnovers,
  purgeCardMetadata,
  replanOperations,
  runDailyCloses,
} from "../operations.js";
import { autoSendStatements, generateDueStatements, pollPayouts } from "../owners.js";
import {
  closeBillingPeriods,
  deliverPluginEvents,
  expireTrials,
  meterUsage,
  processJobRequests,
  purgeOffboardedTenants,
  runDunning,
  runExports,
} from "../platform.js";
import {
  markLiveIfSynced,
  propertiesToProvision,
  runProvisioning,
  type ProvisioningJob,
} from "../provisioning.js";
import { publishAri, type RealtimePublisher } from "../realtime.js";
import { processAriPush, type AriPushJob, type JobControl } from "./ari-push.js";
import { verifyAllAuditChains } from "./audit-verify.js";
import { deriveAvailability } from "./availability-derive.js";
import {
  livePropertyIds,
  processAckSweep,
  processBookings,
  type BookingProcessJob,
} from "./booking-process.js";
import type { Lease } from "./lease.js";
import { runOtbSnapshots } from "./otb-snapshot.js";
import { reconcileProperty } from "./reconcile.js";
import { processWebhook } from "./webhook-ingest.js";

/** Everything a worker process wires once at boot; the queue library is not part of it. */
export interface WorkerWiring {
  db: Db;
  provider: ConnectivityProvider;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  mailer: Mailer;
  lock: LockProvider;
  payments: PaymentProvider;
  payouts: PayoutProvider;
  billing: BillingProvider;
  limiter: RateLimiter;
  breaker: CircuitBreaker;
  lease: Lease;
  sha256Hex: (s: string) => string;
  appUrl: string;
  sellerCountry: string;
  /** Realtime fan-out to the console; null when there is none (the grid polls). */
  realtime: RealtimePublisher | null;
}

export interface EnqueueOptions {
  jobId?: string;
  delayMs?: number;
  attempts?: number;
}

/** Producer side of whichever queue backs the worker. `jobId` deduplicates where the queue can. */
export type Enqueue = (
  queue: QueueName,
  name: string,
  data: unknown,
  opts?: EnqueueOptions,
) => Promise<void>;

export function buildWorkerDeps(w: WorkerWiring) {
  const alerts = {
    unmappedBooking: async (i: { bookingId: string; propertyId: string; mappingState: string }) => {
      w.log.error(i, "booking.unmapped.p1");
    },
    ackLagging: async (i: { revisionId: string; propertyId: string; ageMs: number }) => {
      w.log.error(i, "booking.ack.lagging");
    },
  };
  const base = { db: w.db, clock: w.clock, crypto: w.crypto, log: w.log };
  return {
    ari: {
      db: w.db,
      provider: w.provider,
      limiter: w.limiter,
      breaker: w.breaker,
      clock: w.clock,
      log: w.log,
      lease: w.lease,
    },
    booking: { ...base, provider: w.provider, alerts },
    provisioning: { ...base, provider: w.provider, callbackBase: w.appUrl },
    channel: { db: w.db, provider: w.provider, clock: w.clock, log: w.log },
    // Lock providers (spec 08 §8.4): manual door codes and the fake smart lock until a vendor adapter lands.
    ops: { ...base, lock: w.lock },
    // spec 09: threads and reviews mirrored from the provider; direct threads go out over mail
    messaging: { ...base, provider: w.provider, mailer: w.mailer },
    // spec 17: statements, PDFs and payouts
    owner: { ...base, mailer: w.mailer, payouts: w.payouts, appUrl: w.appUrl },
    // spec 11: rollups, alerts, reconciliation and scheduled reports
    analytics: { ...base, mailer: w.mailer },
    // spec 10: holds expire every minute; abandonment mails (consent, opt-in) hourly
    engine: { ...base, mailer: w.mailer, payments: w.payments, lock: w.lock, appUrl: w.appUrl },
    // spec 12: metering, billing, dunning, plugins, exports, purge and operator-requested jobs
    platform: {
      ...base,
      mailer: w.mailer,
      billing: w.billing,
      sellerCountry: w.sellerCountry,
      appUrl: w.appUrl,
    },
  };
}
export type WorkerDeps = ReturnType<typeof buildWorkerDeps>;

/**
 * The provider addressed with this property's Channex ids (spec 07 mapping): every
 * per-property call goes out with remote ids and comes back with local ones.
 */
async function mappedProvider(
  w: WorkerWiring,
  orgId: string,
  propertyId: string,
): Promise<ConnectivityProvider> {
  const idMap = await asSystem(w.db, orgId, (tx) =>
    new DrizzlePropertyRepository(tx, orgId).idMap(propertyId),
  );
  return withIdMap(w.provider, idMap);
}

/**
 * One job from one queue (spec 04 §4.5). The same function serves BullMQ in
 * apps/worker and Cloudflare Queues in apps/worker-cf; only `ctl` differs.
 */
export async function handleQueueJob(
  w: WorkerWiring,
  d: WorkerDeps,
  queue: QueueName,
  name: string,
  data: unknown,
  ctl: JobControl,
  enqueue: Enqueue,
): Promise<void> {
  const log = w.log;
  switch (queue) {
    case QUEUES.ariPush: {
      // an outbox event (`ari.changed`: orgId on the envelope, propertyId in the payload) or a plain job
      const ev = data as Partial<DomainEvent> & Partial<AriPushJob>;
      const payload = (ev.payload ?? {}) as Partial<AriPushJob>;
      const orgId = ev.orgId ?? payload.orgId;
      const propertyId = ev.propertyId ?? payload.propertyId ?? ev.aggregate?.id;
      if (!orgId || !propertyId) {
        log.error({ name, dedupeKey: ev.dedupeKey }, "ari.push.unaddressed");
        return;
      }
      await processAriPush(
        { ...d.ari, provider: await mappedProvider(w, orgId, propertyId) },
        { orgId, propertyId },
        ctl,
      );
      if (await markLiveIfSynced(w.db, orgId, propertyId))
        log.info({ orgId, propertyId }, "property.live");
      await publishAri(w.realtime, {
        type: "ari.synced",
        orgId,
        propertyId,
        at: w.clock.now().toString(),
      });
      return;
    }
    case QUEUES.bookingProcess: {
      // events from the outbox: booking.revision_applied → availability; booking.pull → feed; explicit jobs → feed
      const ev = data as DomainEvent | BookingProcessJob;
      if ("type" in ev) {
        if (ev.type === "booking.revision_applied") {
          const r = await deriveAvailability(w.db, ev, log, Date.now());
          log.debug({ ...r, dedupeKey: ev.dedupeKey }, "availability.derived");
          // RES-4, OPS-1, OPS-3, INV-14: turnover tasks and access credentials follow the revision
          await replanOperations(d.ops, ev);
        } else if (ev.type === "booking.pull") {
          const pull = ev.payload as BookingProcessJob;
          await processBookings(
            { ...d.booking, provider: await mappedProvider(w, pull.orgId, pull.propertyId) },
            pull,
            ctl.id,
          );
        }
        return;
      }
      await processBookings(
        { ...d.booking, provider: await mappedProvider(w, ev.orgId, ev.propertyId) },
        ev,
        ctl.id,
      );
      return;
    }
    case QUEUES.webhookIngest:
      await processWebhook(w.db, data as DomainEvent, log);
      return;
    case QUEUES.reconcileAri: {
      const ev = data as DomainEvent | { orgId: string; propertyId: string; timezone: string };
      const payload = "type" in ev ? (ev.payload as { orgId: string; propertyId: string }) : ev;
      const [prop] = await rawRows<{ timezone: string }>(
        w.db,
        sql`select timezone from property where id = ${payload.propertyId}`,
      );
      await reconcileProperty(
        { ...d.ari, provider: await mappedProvider(w, payload.orgId, payload.propertyId) },
        payload.orgId,
        payload.propertyId,
        prop?.timezone ?? "UTC",
        ctl.id,
      );
      return;
    }
    case QUEUES.messagesSync: {
      // message.sync / review.sync from webhooks; message.deliver and thread.close from the console
      const e = data as DomainEvent;
      const p = e.payload as { propertyId?: string; threadId?: string; reason?: string };
      switch (e.type) {
        case "message.sync":
          if (p.propertyId)
            await syncThreads(
              { ...d.messaging, provider: await mappedProvider(w, e.orgId, p.propertyId) },
              { orgId: e.orgId, propertyId: p.propertyId },
            );
          break;
        case "review.sync":
          if (p.propertyId)
            await syncReviews(
              { ...d.messaging, provider: await mappedProvider(w, e.orgId, p.propertyId) },
              { orgId: e.orgId, propertyId: p.propertyId },
            );
          break;
        case "message.deliver":
          await deliverOutbound(d.messaging, e.orgId);
          break;
        case "thread.close":
          if (p.threadId)
            await closeThreadRemote(
              d.messaging,
              e.orgId,
              p.threadId,
              p.reason === "no_reply_needed" ? "no_reply_needed" : "resolved",
            );
          break;
        default:
          log.warn({ type: e.type }, "unrouted messaging event");
      }
      return;
    }
    case QUEUES.automationRun: {
      const orgId = (data as { orgId: string }).orgId;
      const r = await runAutomation(d.messaging, orgId);
      if (r.sent + r.skipped + r.failed > 0) log.info({ orgId, ...r }, "automation.run.done");
      return;
    }
    case QUEUES.system:
      await runSystemJob(w, d, name, data, ctl, enqueue);
      return;
    default:
      log.warn({ queue, name }, "unrouted queue job");
  }
}

/** Retry queued guest messages that a transient failure left behind (CXMSG-4). */
async function deliverOutbox(w: WorkerWiring, d: WorkerDeps): Promise<void> {
  const orgs = await rawRows<{ org_id: string }>(
    w.db,
    sql`select distinct org_id from message where delivery_state = 'queued' union select distinct org_id from review_response where delivery_state = 'queued'`,
  );
  for (const o of orgs) await deliverOutbound(d.messaging, o.org_id);
}

/** The scheduled jobs of the `system` queue, by name. */
export async function runSystemJob(
  w: WorkerWiring,
  d: WorkerDeps,
  name: string,
  data: unknown,
  ctl: JobControl,
  enqueue: Enqueue,
): Promise<void> {
  const log = w.log;
  const db = w.db;
  switch (name) {
    case "heartbeat":
      return;
    case "booking.ack_sweep":
      await processAckSweep(d.booking, ctl.id);
      return;
    case "booking.poll": {
      // HOOK-6: correctness never depends on webhook arrival
      for (const p of await livePropertyIds(db))
        await enqueue(
          QUEUES.bookingProcess,
          "booking.poll",
          { ...p, reason: "poll" } satisfies BookingProcessJob,
          { jobId: `booking.poll:${p.propertyId}:${String(Math.floor(Date.now() / 60_000))}` },
        );
      return;
    }
    case "reconcile.nightly": {
      for (const p of await livePropertyIds(db))
        await enqueue(
          QUEUES.reconcileAri,
          "reconcile",
          { ...p, timezone: "UTC" },
          { jobId: `reconcile:${p.propertyId}:${new Date().toISOString().slice(0, 10)}` },
        );
      return;
    }
    case "otb.snapshot": {
      // spec 11 §11.5: the snapshot source is live inventory and bookings since M6
      const n = await runOtbSnapshots(db, w.clock, snapshotSource(), log);
      log.info({ rows: n }, "otb.snapshot.run");
      return;
    }
    case "provisioning.sweep": {
      for (const p of await propertiesToProvision(db))
        await enqueue(QUEUES.system, "provisioning.run", p satisfies ProvisioningJob, {
          jobId: `provisioning.run:${p.propertyId}:${String(Math.floor(Date.now() / 30_000))}`,
          attempts: 5,
        });
      return;
    }
    case "provisioning.run": {
      const st = await runProvisioning(d.provisioning, data as ProvisioningJob);
      log.info({ ...(data as ProvisioningJob), step: st.step }, "provisioning.run.done");
      return;
    }
    case "horizon.extend":
      await extendHorizons({ db, clock: w.clock, log });
      return;
    case "channel.health_poll":
      await pollChannelHealth(d.channel);
      return;
    case "ops.escalate":
      await escalateTurnovers(d.ops);
      return;
    case "daily_close":
      await runDailyCloses({ db, clock: w.clock, log });
      return;
    case "messages.poll": {
      const r = await pollThreads(d.messaging);
      if (r.newInbound > 0) log.info(r, "messages.poll.run");
      await deliverOutbox(w, d);
      return;
    }
    case "automation.tick": {
      for (const orgId of await orgsWithAutomation(db))
        await enqueue(
          QUEUES.automationRun,
          "automation.run",
          { orgId },
          { jobId: `automation.run:${orgId}:${String(Math.floor(Date.now() / 60_000))}` },
        );
      return;
    }
    case "reviews.sweep": {
      const n = await pollReviews(d.messaging);
      log.info({ created: n }, "reviews.sweep.run");
      return;
    }
    case "statements.sweep": {
      const r = await generateDueStatements(d.owner);
      log.info(r, "statements.sweep.run");
      return;
    }
    case "statements.autosend": {
      const n = await autoSendStatements(d.owner);
      if (n > 0) log.info({ sent: n }, "statements.autosend.run");
      return;
    }
    case "payouts.poll": {
      const r = await pollPayouts(d.owner);
      if (r.paid + r.failed > 0) log.info(r, "payouts.poll.run");
      return;
    }
    case "rollups.nightly": {
      const r = await nightlyRollups(d.analytics);
      log.info(r, "rollups.nightly.run");
      return;
    }
    case "alerts.compute": {
      const r = await computeAlertsForAll(d.analytics);
      if (r.raised + r.resolved > 0) log.info(r, "alerts.compute.run");
      return;
    }
    case "statements.reconcile": {
      for (const o of await rawRows<{ org_id: string }>(
        db,
        sql`select distinct org_id from owner_statement where state in ('sent', 'paid')`,
      )) {
        const r = await reconcileStatements(d.analytics, o.org_id);
        if (r.mismatches > 0) log.error({ orgId: o.org_id, ...r }, "statements.reconcile.mismatch");
      }
      return;
    }
    case "reports.scheduled": {
      const n = await sendScheduledReports(d.analytics);
      if (n > 0) log.info({ sent: n }, "reports.scheduled.run");
      return;
    }
    case "holds.expire": {
      const n = await expireHolds(d.engine);
      if (n > 0) log.info({ released: n }, "holds.expire.run");
      return;
    }
    case "payments.collect": {
      const r = await collectDuePayments({
        db,
        payments: d.engine.payments,
        clock: w.clock,
        log,
      });
      if (r.charged + r.failed + r.cancelled > 0) log.info(r, "payments.collect.run");
      return;
    }
    case "holds.abandoned": {
      let sent = 0;
      for (const o of await withoutTenant(db, (tx) =>
        rawRows<{ org_id: string }>(
          tx,
          sql`select distinct org_id from booking_engine_settings where abandonment_emails`,
        ),
      ))
        sent += await sendAbandonmentMails(d.engine, o.org_id);
      if (sent > 0) log.info({ sent }, "holds.abandoned.run");
      return;
    }
    case "usage.meter":
      log.info({ orgs: await meterUsage(d.platform) }, "usage.meter.run");
      return;
    case "billing.close": {
      const r = await closeBillingPeriods(d.platform);
      if (r.invoiced + r.failed > 0) log.info(r, "billing.close.run");
      return;
    }
    case "dunning.run": {
      const r = await runDunning(d.platform);
      if (r.retried + r.suspended > 0) log.info(r, "dunning.run");
      const expired = await expireTrials(d.platform);
      if (expired > 0) log.info({ expired }, "trials.expire.run");
      return;
    }
    case "plugins.deliver": {
      const r = await deliverPluginEvents(d.platform);
      if (r.delivered + r.failed > 0) log.info(r, "plugins.deliver.run");
      return;
    }
    case "exports.run": {
      const n = await runExports(d.platform);
      if (n > 0) log.info({ exports: n }, "exports.run");
      return;
    }
    case "tenants.purge": {
      const n = await purgeOffboardedTenants(d.platform);
      if (n > 0) log.info({ purged: n }, "tenants.purge.run");
      return;
    }
    case "ops.jobs": {
      // operator console requests (spec 12 §12.1 "Jobs"), each a job the worker already knows
      const n = await processJobRequests(d.platform, {
        "reconcile.nightly": async () => {
          await enqueue(QUEUES.system, "reconcile.nightly", { name: "reconcile.nightly" });
          return { queued: true };
        },
        "rollups.nightly": async (orgId) => ({
          rollups: await nightlyRollups(d.analytics, orgId ?? undefined),
        }),
        daily_close: async () => ({ ...(await runDailyCloses({ db, clock: w.clock, log })) }),
        "retention.purge": async () => ({
          ...(await purgeCardMetadata({ db, clock: w.clock, log })),
        }),
        "statements.sweep": async (orgId) => ({
          ...(await generateDueStatements(d.owner, orgId ?? undefined)),
        }),
        "usage.meter": async (orgId) => ({
          orgs: await meterUsage(d.platform, orgId ?? undefined),
        }),
      });
      if (n > 0) log.info({ handled: n }, "ops.jobs.run");
      return;
    }
    case "retention.purge": {
      const r = await purgeCardMetadata({ db, clock: w.clock, log });
      log.info(r, "retention.purge.run");
      return;
    }
    case "audit.verify": {
      for (const r of await verifyAllAuditChains(db, w.sha256Hex))
        if (!r.ok) log.error({ orgId: r.orgId, brokenAtSeq: r.brokenAtSeq }, "audit.chain.broken");
      return;
    }
    default:
      log.warn({ name }, "unrouted system job");
  }
}

/** The scheduler table (spec 04 §4.5). `every` in milliseconds, `pattern` a 5-field cron in UTC. */
export const SCHEDULE: ReadonlyArray<{ name: string; every?: number; pattern?: string }> = [
  { name: "heartbeat", every: 60_000 },
  { name: "provisioning.sweep", every: 30_000 },
  { name: "horizon.extend", pattern: "15 2 * * *" },
  { name: "channel.health_poll", every: 300_000 },
  { name: "ops.escalate", every: 60_000 },
  { name: "messages.poll", every: 120_000 },
  { name: "statements.sweep", pattern: "0 4 * * *" },
  { name: "statements.autosend", pattern: "30 4 * * *" },
  { name: "payouts.poll", pattern: "10 * * * *" },
  { name: "automation.tick", every: 60_000 },
  { name: "reviews.sweep", pattern: "50 * * * *" },
  { name: "daily_close", pattern: "20 * * * *" },
  { name: "retention.purge", pattern: "40 4 * * *" },
  { name: "holds.expire", every: 60_000 },
  { name: "payments.collect", pattern: "0 6 * * *" },
  { name: "usage.meter", pattern: "45 2 * * *" },
  { name: "billing.close", pattern: "0 5 * * *" },
  { name: "dunning.run", pattern: "30 5 * * *" },
  { name: "plugins.deliver", every: 30_000 },
  { name: "exports.run", every: 60_000 },
  { name: "tenants.purge", pattern: "15 3 * * *" },
  { name: "ops.jobs", every: 30_000 },
  { name: "holds.abandoned", pattern: "25 * * * *" },
  { name: "booking.ack_sweep", every: 60_000 },
  { name: "booking.poll", every: 60_000 },
  { name: "reconcile.nightly", pattern: "30 3 * * *" },
  { name: "otb.snapshot", pattern: "5 * * * *" },
  { name: "audit.verify", pattern: "0 3 * * 0" },
];

function fieldMatches(field: string, value: number): boolean {
  return field.split(",").some((part) => {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? Number(stepStr) : 1;
    if (range === "*" || range === undefined) return value % step === 0;
    const [lo, hi] = range.split("-").map(Number);
    if (hi === undefined) return value === lo;
    return value >= lo! && value <= hi && (value - lo!) % step === 0;
  });
}

/** Minimal 5-field cron matcher (minute hour day-of-month month day-of-week), UTC. */
export function cronMatches(pattern: string, at: Date): boolean {
  const [min, hour, dom, mon, dow] = pattern.trim().split(/\s+/);
  if (!min || !hour || !dom || !mon || !dow) throw new Error(`bad cron pattern: ${pattern}`);
  return (
    fieldMatches(min, at.getUTCMinutes()) &&
    fieldMatches(hour, at.getUTCHours()) &&
    fieldMatches(dom, at.getUTCDate()) &&
    fieldMatches(mon, at.getUTCMonth() + 1) &&
    fieldMatches(dow, at.getUTCDay())
  );
}

/**
 * Jobs due on a one-minute scheduler tick. Anything scheduled more often than
 * a minute runs every tick (Cloudflare Cron Triggers have minute granularity).
 */
export function dueJobs(at: Date, schedule = SCHEDULE): string[] {
  const minuteOfDay = at.getUTCHours() * 60 + at.getUTCMinutes();
  return schedule
    .filter((s) => {
      if (s.pattern) return cronMatches(s.pattern, at);
      const minutes = Math.max(1, Math.round((s.every ?? 60_000) / 60_000));
      return minuteOfDay % minutes === 0;
    })
    .map((s) => s.name);
}
