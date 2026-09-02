import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { LocalDate } from "@pms/core";
import { loadConfig } from "./config.js";
import { QUEUES, type SystemJob } from "./queues.js";

const config = loadConfig();
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const log = (level: string, msg: string, extra: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }));
};

const systemQueue = new Queue<SystemJob["data"], void, SystemJob["name"]>(QUEUES.system, {
  connection,
});

const worker = new Worker<SystemJob["data"], void, SystemJob["name"]>(
  QUEUES.system,
  (job) => {
    switch (job.name) {
      case "heartbeat":
        log("info", "heartbeat", { at: job.data.at, today: LocalDate.today("UTC").toString() });
        return Promise.resolve();
    }
  },
  { connection, concurrency: config.WORKER_CONCURRENCY },
);

worker.on("failed", (job, err) => log("error", "job failed", { job: job?.name, err: err.message }));

async function main(): Promise<void> {
  await systemQueue.upsertJobScheduler(
    "heartbeat",
    { every: 60_000 },
    { name: "heartbeat", data: { at: new Date().toISOString() } },
  );
  log("info", "worker started", {
    queues: Object.values(QUEUES),
    concurrency: config.WORKER_CONCURRENCY,
  });
}

async function shutdown(signal: string): Promise<void> {
  log("info", "shutting down", { signal });
  await worker.close();
  await systemQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err: unknown) => {
  log("error", "worker failed to start", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
