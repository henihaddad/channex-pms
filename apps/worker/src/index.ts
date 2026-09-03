import { Worker, type Job } from "bullmq";
import { QUEUES, selectMailer, type QueueName } from "@pms/runtime";
import { MemoryCircuitBreaker, TokenBucket } from "@pms/sync";
import {
  FakeBillingProvider,
  FakeLockProvider,
  FakePaymentProvider,
  FakePayoutProvider,
} from "@pms/core";
import {
  StripeBillingProvider,
  StripeConnectPayoutProvider,
  StripePaymentProvider,
  stripeTransport,
} from "@pms/connectivity";
import {
  buildWorkerDeps,
  handleQueueJob,
  SCHEDULE,
  selectProvider,
  type Enqueue,
  type WorkerWiring,
} from "@pms/jobs";
import { buildContainer } from "./container.js";
import { bullPublisher, startOutboxPublisher } from "./jobs/outbox-publisher.js";
import { redisLease } from "./lease.js";

/**
 * BullMQ adapter around the shared job runtime (@pms/jobs/worker). The
 * processors, the system-job table and the schedule live in the package so
 * apps/worker-cf runs the same code on Cloudflare Queues and Cron Triggers.
 */
const c = await buildContainer();
const log = c.log;
const { provider, kind: providerKind } = selectProvider(c.config, process.env, log, {
  onResponse: ({ op, status, durationMs }) =>
    log.debug({ op, status, durationMs }, "provider.response"),
});
const stripeKey = process.env.STRIPE_SECRET_KEY;
const wiring: WorkerWiring = {
  db: c.db.db,
  provider,
  clock: c.clock,
  crypto: c.crypto,
  log,
  mailer: selectMailer(c.config, log),
  lock: new FakeLockProvider(),
  payments: stripeKey
    ? new StripePaymentProvider(stripeTransport(), stripeKey)
    : new FakePaymentProvider(),
  payouts: stripeKey
    ? new StripeConnectPayoutProvider(stripeTransport(), stripeKey)
    : new FakePayoutProvider(),
  billing: stripeKey
    ? new StripeBillingProvider(stripeTransport(), stripeKey)
    : new FakeBillingProvider(),
  limiter: new TokenBucket(c.clock, { baseRatePerSecond: 5, burst: 10 }),
  breaker: new MemoryCircuitBreaker(c.clock, { failureThreshold: 5, cooldownMs: 60_000 }),
  lease: redisLease(c.redis),
  sha256Hex: c.sha256Hex,
  appUrl: c.config.NEXT_PUBLIC_APP_URL,
  sellerCountry: process.env.PMS_SELLER_COUNTRY ?? "PT",
  realtime: c.redis,
};
const deps = buildWorkerDeps(wiring);

const enqueue: Enqueue = async (queue, name, data, opts = {}) => {
  await c.queues[queue].add(name, data, {
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    ...(opts.delayMs ? { delay: opts.delayMs } : {}),
    ...(opts.attempts
      ? { attempts: opts.attempts, backoff: { type: "exponential", delay: 5_000 } }
      : {}),
    removeOnComplete: 500,
    removeOnFail: 500,
  });
};

const CONCURRENCY: Partial<Record<QueueName, number>> = {
  [QUEUES.ariPush]: 4,
  [QUEUES.webhookIngest]: 8,
  [QUEUES.reconcileAri]: 1,
  [QUEUES.messagesSync]: 2,
  [QUEUES.automationRun]: 1,
  [QUEUES.system]: 2,
};
const CONSUMED: QueueName[] = [
  QUEUES.ariPush,
  QUEUES.bookingProcess,
  QUEUES.webhookIngest,
  QUEUES.reconcileAri,
  QUEUES.messagesSync,
  QUEUES.automationRun,
  QUEUES.system,
];

const workers: Worker[] = CONSUMED.map(
  (queue) =>
    new Worker(
      queue,
      async (job: Job) =>
        handleQueueJob(
          wiring,
          deps,
          queue,
          job.name,
          job.data,
          {
            id: String(job.id ?? job.name),
            delay: (ms) => job.moveToDelayed(Date.now() + ms, job.token),
          },
          enqueue,
        ),
      {
        connection: c.redis,
        concurrency: CONCURRENCY[queue] ?? c.config.WORKER_CONCURRENCY,
      },
    ),
);

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
  const system = c.queues[QUEUES.system];
  for (const s of SCHEDULE)
    await system.upsertJobScheduler(
      s.name,
      s.pattern ? { pattern: s.pattern } : { every: s.every ?? 60_000 },
      { name: s.name },
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
