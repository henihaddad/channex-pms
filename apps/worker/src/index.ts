import { Worker, type Job } from "bullmq";
import { QUEUES } from "@pms/runtime";
import { buildContainer } from "./container.js";
import { verifyAllAuditChains } from "./jobs/audit-verify.js";
import { emptySnapshotSource, runOtbSnapshots } from "./jobs/otb-snapshot.js";
import { bullPublisher, startOutboxPublisher } from "./jobs/outbox-publisher.js";

const c = await buildContainer();
const log = c.log;

/** System queue: schedulers and housekeeping. Per-domain queues get their processors in M1+. */
const systemWorker = new Worker(
  QUEUES.system,
  async (job: Job) => {
    switch (job.name) {
      case "heartbeat":
        log.debug({ at: new Date().toISOString() }, "heartbeat");
        return;
      case "otb.snapshot": {
        const n = await runOtbSnapshots(c.db.db, c.clock, emptySnapshotSource, log);
        log.info({ rows: n }, "otb.snapshot.run");
        return;
      }
      case "audit.verify": {
        const results = await verifyAllAuditChains(c.db.db, c.sha256Hex);
        for (const r of results)
          if (!r.ok)
            log.error({ orgId: r.orgId, brokenAtSeq: r.brokenAtSeq }, "audit.chain.broken");
        return;
      }
      default:
        log.warn({ name: job.name }, "unrouted system job");
    }
  },
  { connection: c.redis, concurrency: 2 },
);
systemWorker.on("failed", (job, err) =>
  log.error({ job: job?.name, err: err.message }, "job.failed"),
);

const stopOutbox = startOutboxPublisher(c.db.db, bullPublisher(c.queues), {
  intervalMs: 1000,
  onError: (e) =>
    log.error({ err: e instanceof Error ? e.message : String(e) }, "outbox.publish.failed"),
});

async function main(): Promise<void> {
  const system = c.queues[QUEUES.system];
  await system.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat" });
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
      concurrency: c.config.WORKER_CONCURRENCY,
    },
    "worker.started",
  );
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, "worker.shutdown");
  await stopOutbox();
  await systemWorker.close();
  await c.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err: unknown) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, "worker.start.failed");
  process.exit(1);
});
