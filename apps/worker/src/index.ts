import { Worker, type Job } from "bullmq";
import type { DomainEvent } from "@pms/core";
import { rawRows, sql } from "@pms/db";
import { consoleMailer, QUEUES } from "@pms/runtime";
import { MemoryCircuitBreaker, TokenBucket } from "@pms/sync";
import { buildContainer } from "./container.js";
import { verifyAllAuditChains } from "./jobs/audit-verify.js";
import { runOtbSnapshots } from "./jobs/otb-snapshot.js";
import { bullPublisher, startOutboxPublisher } from "./jobs/outbox-publisher.js";
import { redisLease } from "./lease.js";
import { processAriPush, type AriPushJob } from "./processors/ari-push.js";
import { deriveAvailability } from "./processors/availability-derive.js";
import {
  livePropertyIds,
  processAckSweep,
  processBookings,
  type BookingProcessJob,
} from "./processors/booking-process.js";
import { reconcileProperty } from "./processors/reconcile.js";
import { processWebhook } from "./processors/webhook-ingest.js";
import { selectProvider } from "./provider.js";
import { FakeLockProvider, FakePayoutProvider } from "@pms/core";
import { StripeConnectPayoutProvider, stripeTransport } from "@pms/connectivity";
import {
  escalateTurnovers,
  extendHorizons,
  purgeCardMetadata,
  replanOperations,
  runDailyCloses,
  markLiveIfSynced,
  pollChannelHealth,
  closeThreadRemote,
  deliverOutbound,
  orgsWithAutomation,
  pollReviews,
  pollThreads,
  runAutomation,
  syncReviews,
  syncThreads,
  autoSendStatements,
  generateDueStatements,
  pollPayouts,
  computeAlertsForAll,
  nightlyRollups,
  reconcileStatements,
  sendScheduledReports,
  snapshotSource,
  propertiesToProvision,
  publishAri,
  runProvisioning,
  type ProvisioningJob,
} from "@pms/jobs";

const c = await buildContainer();
const log = c.log;
const { provider, kind: providerKind } = selectProvider(c.config, process.env, log, {
  onResponse: ({ op, status, durationMs }) =>
    log.debug({ op, status, durationMs }, "provider.response"),
});
const limiter = new TokenBucket(c.clock, { baseRatePerSecond: 5, burst: 10 });
const breaker = new MemoryCircuitBreaker(c.clock, { failureThreshold: 5, cooldownMs: 60_000 });
const lease = redisLease(c.redis);
const alerts = {
  unmappedBooking: async (i: { bookingId: string; propertyId: string; mappingState: string }) => {
    log.error(i, "booking.unmapped.p1");
  },
  ackLagging: async (i: { revisionId: string; propertyId: string; ageMs: number }) => {
    log.error(i, "booking.ack.lagging");
  },
};
const bookingDeps = { db: c.db.db, provider, crypto: c.crypto, clock: c.clock, log, alerts };
const provisioningDeps = {
  db: c.db.db,
  provider,
  clock: c.clock,
  crypto: c.crypto,
  log,
  callbackBase: c.config.NEXT_PUBLIC_APP_URL,
};
const channelDeps = { db: c.db.db, provider, clock: c.clock, log };
// Lock providers (spec 08 §8.4): manual door codes and the fake smart lock until a vendor adapter lands.
const opsDeps = {
  db: c.db.db,
  clock: c.clock,
  crypto: c.crypto,
  lock: new FakeLockProvider(),
  log,
};
// spec 09: threads and reviews mirrored from the provider; direct threads go out over mail
const messagingDeps = {
  db: c.db.db,
  provider,
  clock: c.clock,
  crypto: c.crypto,
  log,
  mailer: consoleMailer(log),
};
// spec 17: statements, PDFs and payouts. Stripe Connect when a secret key is set, the fake otherwise.
const ownerDeps = {
  db: c.db.db,
  clock: c.clock,
  crypto: c.crypto,
  log,
  mailer: consoleMailer(log),
  payouts: process.env.STRIPE_SECRET_KEY
    ? new StripeConnectPayoutProvider(stripeTransport(), process.env.STRIPE_SECRET_KEY)
    : new FakePayoutProvider(),
  appUrl: c.config.NEXT_PUBLIC_APP_URL,
};
// spec 11: rollups, alerts, reconciliation and scheduled reports
const analyticsDeps = {
  db: c.db.db,
  clock: c.clock,
  crypto: c.crypto,
  log,
  mailer: consoleMailer(log),
};
const realtime = c.redis;
const workerOpts = { connection: c.redis, concurrency: c.config.WORKER_CONCURRENCY };

const system = c.queues[QUEUES.system];
const workers: Worker[] = [
  new Worker<AriPushJob>(
    QUEUES.ariPush,
    async (job) => {
      await processAriPush(
        { db: c.db.db, provider, limiter, breaker, clock: c.clock, log, lease },
        job,
      );
      const { orgId, propertyId } = job.data;
      if (await markLiveIfSynced(c.db.db, orgId, propertyId))
        log.info({ orgId, propertyId }, "property.live");
      await publishAri(realtime, {
        type: "ari.synced",
        orgId,
        propertyId,
        at: c.clock.now().toString(),
      });
    },
    { ...workerOpts, concurrency: 4 },
  ),

  new Worker(
    QUEUES.bookingProcess,
    async (job: Job) => {
      // events from the outbox: booking.revision_applied → availability; booking.pull → feed; explicit jobs → feed
      const data = job.data as DomainEvent | BookingProcessJob;
      if ("type" in data) {
        if (data.type === "booking.revision_applied") {
          const r = await deriveAvailability(c.db.db, data, log, Date.now());
          log.debug({ ...r, dedupeKey: data.dedupeKey }, "availability.derived");
          // RES-4, OPS-1, OPS-3, INV-14: turnover tasks and access credentials follow the revision
          await replanOperations(opsDeps, data);
        } else if (data.type === "booking.pull") {
          await processBookings(
            bookingDeps,
            data.payload as BookingProcessJob,
            String(job.id ?? data.dedupeKey),
          );
        }
        return;
      }
      await processBookings(bookingDeps, data, String(job.id ?? "manual"));
    },
    workerOpts,
  ),

  new Worker(
    QUEUES.webhookIngest,
    async (job: Job<DomainEvent>) => {
      await processWebhook(c.db.db, job.data, log);
    },
    { ...workerOpts, concurrency: 8 },
  ),

  new Worker(
    QUEUES.reconcileAri,
    async (job: Job) => {
      const data = job.data as
        DomainEvent | { orgId: string; propertyId: string; timezone: string };
      const payload =
        "type" in data ? (data.payload as { orgId: string; propertyId: string }) : data;
      const [prop] = await rawRows<{ timezone: string }>(
        c.db.db,
        sql`select timezone from property where id = ${payload.propertyId}`,
      );
      await reconcileProperty(
        { db: c.db.db, provider, limiter, breaker, clock: c.clock, log },
        payload.orgId,
        payload.propertyId,
        prop?.timezone ?? "UTC",
        String(job.id ?? "?"),
      );
    },
    { ...workerOpts, concurrency: 1 },
  ),

  new Worker(
    QUEUES.messagesSync,
    async (job: Job<DomainEvent>) => {
      // message.sync / review.sync from webhooks; message.deliver and thread.close from the console
      const e = job.data;
      const p = e.payload as { propertyId?: string; threadId?: string; reason?: string };
      switch (e.type) {
        case "message.sync":
          if (p.propertyId)
            await syncThreads(messagingDeps, { orgId: e.orgId, propertyId: p.propertyId });
          break;
        case "review.sync":
          if (p.propertyId)
            await syncReviews(messagingDeps, { orgId: e.orgId, propertyId: p.propertyId });
          break;
        case "message.deliver":
          await deliverOutbound(messagingDeps, e.orgId);
          break;
        case "thread.close":
          if (p.threadId)
            await closeThreadRemote(
              messagingDeps,
              e.orgId,
              p.threadId,
              p.reason === "no_reply_needed" ? "no_reply_needed" : "resolved",
            );
          break;
        default:
          log.warn({ type: e.type }, "unrouted messaging event");
      }
    },
    { ...workerOpts, concurrency: 2 },
  ),

  new Worker(
    QUEUES.automationRun,
    async (job: Job) => {
      const orgId = (job.data as { orgId: string }).orgId;
      const r = await runAutomation(messagingDeps, orgId);
      if (r.sent + r.skipped + r.failed > 0) log.info({ orgId, ...r }, "automation.run.done");
    },
    { ...workerOpts, concurrency: 1 },
  ),

  new Worker(
    QUEUES.system,
    async (job: Job) => {
      switch (job.name) {
        case "heartbeat":
          return;
        case "booking.ack_sweep":
          await processAckSweep(bookingDeps, String(job.id ?? "sweep"));
          return;
        case "booking.poll": {
          // HOOK-6: correctness never depends on webhook arrival
          for (const p of await livePropertyIds(c.db.db)) {
            await c.queues[QUEUES.bookingProcess].add(
              "booking.poll",
              { ...p, reason: "poll" } satisfies BookingProcessJob,
              {
                jobId: `booking.poll:${p.propertyId}:${String(Math.floor(Date.now() / 60_000))}`,
                removeOnComplete: 500,
                removeOnFail: 500,
              },
            );
          }
          return;
        }
        case "reconcile.nightly": {
          for (const p of await livePropertyIds(c.db.db)) {
            await c.queues[QUEUES.reconcileAri].add(
              "reconcile",
              { ...p, timezone: "UTC" },
              {
                jobId: `reconcile:${p.propertyId}:${new Date().toISOString().slice(0, 10)}`,
                removeOnComplete: 100,
                removeOnFail: 100,
              },
            );
          }
          return;
        }
        case "otb.snapshot": {
          // spec 11 §11.5: the snapshot source is live inventory and bookings since M6
          const n = await runOtbSnapshots(c.db.db, c.clock, snapshotSource(), log);
          log.info({ rows: n }, "otb.snapshot.run");
          return;
        }
        case "provisioning.sweep": {
          for (const p of await propertiesToProvision(c.db.db)) {
            await system.add("provisioning.run", p satisfies ProvisioningJob, {
              jobId: `provisioning.run:${p.propertyId}:${String(Math.floor(Date.now() / 30_000))}`,
              attempts: 5,
              backoff: { type: "exponential", delay: 5_000 },
              removeOnComplete: 200,
              removeOnFail: 200,
            });
          }
          return;
        }
        case "provisioning.run": {
          const st = await runProvisioning(provisioningDeps, job.data as ProvisioningJob);
          log.info({ ...(job.data as ProvisioningJob), step: st.step }, "provisioning.run.done");
          return;
        }
        case "horizon.extend": {
          await extendHorizons({ db: c.db.db, clock: c.clock, log });
          return;
        }
        case "channel.health_poll": {
          await pollChannelHealth(channelDeps);
          return;
        }
        case "ops.escalate": {
          await escalateTurnovers(opsDeps);
          return;
        }
        case "daily_close": {
          await runDailyCloses({ db: c.db.db, clock: c.clock, log });
          return;
        }
        case "messages.poll": {
          const r = await pollThreads(messagingDeps);
          if (r.newInbound > 0) log.info(r, "messages.poll.run");
          await deliverOutbox();
          return;
        }
        case "automation.tick": {
          for (const orgId of await orgsWithAutomation(c.db.db))
            await c.queues[QUEUES.automationRun].add(
              "automation.run",
              { orgId },
              {
                jobId: `automation.run:${orgId}:${String(Math.floor(Date.now() / 60_000))}`,
                removeOnComplete: 200,
                removeOnFail: 200,
              },
            );
          return;
        }
        case "reviews.sweep": {
          const n = await pollReviews(messagingDeps);
          log.info({ created: n }, "reviews.sweep.run");
          return;
        }
        case "statements.sweep": {
          const r = await generateDueStatements(ownerDeps);
          log.info(r, "statements.sweep.run");
          return;
        }
        case "statements.autosend": {
          const n = await autoSendStatements(ownerDeps);
          if (n > 0) log.info({ sent: n }, "statements.autosend.run");
          return;
        }
        case "payouts.poll": {
          const r = await pollPayouts(ownerDeps);
          if (r.paid + r.failed > 0) log.info(r, "payouts.poll.run");
          return;
        }
        case "rollups.nightly": {
          const r = await nightlyRollups(analyticsDeps);
          log.info(r, "rollups.nightly.run");
          return;
        }
        case "alerts.compute": {
          const r = await computeAlertsForAll(analyticsDeps);
          if (r.raised + r.resolved > 0) log.info(r, "alerts.compute.run");
          return;
        }
        case "statements.reconcile": {
          for (const o of await rawRows<{ org_id: string }>(
            c.db.db,
            sql`select distinct org_id from owner_statement where state in ('sent', 'paid')`,
          )) {
            const r = await reconcileStatements(analyticsDeps, o.org_id);
            if (r.mismatches > 0)
              log.error({ orgId: o.org_id, ...r }, "statements.reconcile.mismatch");
          }
          return;
        }
        case "reports.scheduled": {
          const n = await sendScheduledReports(analyticsDeps);
          if (n > 0) log.info({ sent: n }, "reports.scheduled.run");
          return;
        }
        case "retention.purge": {
          const r = await purgeCardMetadata({ db: c.db.db, clock: c.clock, log });
          log.info(r, "retention.purge.run");
          return;
        }
        case "audit.verify": {
          for (const r of await verifyAllAuditChains(c.db.db, c.sha256Hex))
            if (!r.ok)
              log.error({ orgId: r.orgId, brokenAtSeq: r.brokenAtSeq }, "audit.chain.broken");
          return;
        }
        default:
          log.warn({ name: job.name }, "unrouted system job");
      }
    },
    { ...workerOpts, concurrency: 2 },
  ),
];
/** Retry queued guest messages that a transient failure left behind (CXMSG-4). */
async function deliverOutbox(): Promise<void> {
  const orgs = await rawRows<{ org_id: string }>(
    c.db.db,
    sql`select distinct org_id from message where delivery_state = 'queued' union select distinct org_id from review_response where delivery_state = 'queued'`,
  );
  for (const o of orgs) await deliverOutbound(messagingDeps, o.org_id);
}

for (const w of workers)
  w.on("failed", (job, err) =>
    log.error({ queue: w.name, job: job?.name, id: job?.id, err: err.message }, "job.failed"),
  );

const stopOutbox = startOutboxPublisher(c.db.db, bullPublisher(c.queues), {
  intervalMs: 1000,
  onError: (e) =>
    log.error({ err: e instanceof Error ? e.message : String(e) }, "outbox.publish.failed"),
});

async function main(): Promise<void> {
  await system.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat" });
  await system.upsertJobScheduler(
    "provisioning.sweep",
    { every: 30_000 },
    { name: "provisioning.sweep" },
  );
  await system.upsertJobScheduler(
    "horizon.extend",
    { pattern: "15 2 * * *" },
    { name: "horizon.extend" },
  );
  await system.upsertJobScheduler(
    "channel.health_poll",
    { every: 300_000 },
    { name: "channel.health_poll" },
  );
  await system.upsertJobScheduler("ops.escalate", { every: 60_000 }, { name: "ops.escalate" });
  await system.upsertJobScheduler("messages.poll", { every: 120_000 }, { name: "messages.poll" });
  await system.upsertJobScheduler(
    "statements.sweep",
    { pattern: "0 4 * * *" },
    { name: "statements.sweep" },
  );
  await system.upsertJobScheduler(
    "statements.autosend",
    { pattern: "30 4 * * *" },
    { name: "statements.autosend" },
  );
  await system.upsertJobScheduler(
    "payouts.poll",
    { pattern: "10 * * * *" },
    { name: "payouts.poll" },
  );
  await system.upsertJobScheduler(
    "automation.tick",
    { every: 60_000 },
    { name: "automation.tick" },
  );
  await system.upsertJobScheduler(
    "reviews.sweep",
    { pattern: "50 * * * *" },
    { name: "reviews.sweep" },
  );
  await system.upsertJobScheduler(
    "daily_close",
    { pattern: "20 * * * *" },
    { name: "daily_close" },
  );
  await system.upsertJobScheduler(
    "retention.purge",
    { pattern: "40 4 * * *" },
    { name: "retention.purge" },
  );
  await system.upsertJobScheduler(
    "booking.ack_sweep",
    { every: 60_000 },
    { name: "booking.ack_sweep" },
  );
  await system.upsertJobScheduler("booking.poll", { every: 60_000 }, { name: "booking.poll" });
  await system.upsertJobScheduler(
    "reconcile.nightly",
    { pattern: "30 3 * * *" },
    { name: "reconcile.nightly" },
  );
  await system.upsertJobScheduler(
    "otb.snapshot",
    { pattern: "5 * * * *" },
    { name: "otb.snapshot" },
  );
  await system.upsertJobScheduler(
    "audit.verify",
    { pattern: "0 3 * * 0" },
    { name: "audit.verify" },
  );
  log.info(
    {
      queues: Object.values(QUEUES),
      driver: c.db.driver,
      provider: providerKind,
      concurrency: c.config.WORKER_CONCURRENCY,
    },
    "worker.started",
  );
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, "worker.shutdown");
  await stopOutbox();
  await Promise.all(workers.map((w) => w.close()));
  await c.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err: unknown) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, "worker.start.failed");
  process.exit(1);
});
