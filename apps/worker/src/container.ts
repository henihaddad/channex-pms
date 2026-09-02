import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { SystemClock, type Clock } from "@pms/core";
import { connect, type DbHandle } from "@pms/db";
import {
  createCrypto,
  createLogger,
  loadConfig,
  DEV_MASTER_KEY,
  QUEUES,
  type Config,
  type Logger,
  type QueueName,
} from "@pms/runtime";

/**
 * Typed dependency container built once at boot (spec 14 §14.2: ~40 lines, not a framework).
 */
export interface Container {
  config: Config;
  log: Logger;
  clock: Clock;
  db: DbHandle;
  redis: Redis;
  queues: Record<QueueName, Queue>;
  sha256Hex: (s: string) => string;
  crypto: ReturnType<typeof createCrypto>;
  close(): Promise<void>;
}

export async function buildContainer(env: NodeJS.ProcessEnv = process.env): Promise<Container> {
  const config = loadConfig(env);
  const log = createLogger({ level: config.LOG_LEVEL, service: "worker" });
  const db = await connect(env);
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  const queues = Object.fromEntries(
    Object.values(QUEUES).map((name) => [name, new Queue(name, { connection: redis })]),
  ) as Record<QueueName, Queue>;
  return {
    config,
    log,
    clock: new SystemClock(),
    db,
    redis,
    queues,
    sha256Hex: (s) => createHash("sha256").update(s).digest("hex"),
    crypto: createCrypto(config.PMS_MASTER_KEY ?? DEV_MASTER_KEY),
    close: async () => {
      await Promise.all(Object.values(queues).map((q) => q.close()));
      await redis.quit().catch(() => undefined);
      await db.close();
    },
  };
}
