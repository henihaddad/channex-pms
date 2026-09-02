import { z } from "zod";

const schema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return schema.parse(env);
}
