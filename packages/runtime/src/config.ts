import { z } from "zod";

/** 12-factor configuration, validated at boot (spec 04 §4.8). The process refuses to start on invalid config. */
export const configSchema = z.object({
  /** Deployment mode. Independent of NODE_ENV, which build tools set for their own reasons. */
  PMS_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  /** 32-byte hex master key for sealing secrets and wrapping tenant DEKs (PRIV-1). */
  PMS_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "PMS_MASTER_KEY must be 64 hex characters")
    .optional(),
  /** HS256 key for short-lived access tokens. */
  PMS_SESSION_KEY: z.string().min(32).optional(),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  MAIL_TRANSPORT: z.enum(["console", "smtp", "resend"]).default("console"),
  SMTP_URL: z.string().optional(),
  /** HTTPS mail API (the transport Cloudflare Workers can use). */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Channex PMS <no-reply@otabridge.com>"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const cfg = parsed.data;
  if (
    cfg.PMS_ENV === "production" &&
    (!cfg.PMS_MASTER_KEY || !cfg.PMS_SESSION_KEY || !cfg.DATABASE_URL)
  ) {
    throw new Error("Production requires DATABASE_URL, PMS_MASTER_KEY and PMS_SESSION_KEY");
  }
  return cfg;
}

/** Deterministic dev-only keys so `pnpm dev` works without a .env. Never used when the env sets them. */
export const DEV_MASTER_KEY = "0f".repeat(32);
export const DEV_SESSION_KEY = "dev-session-key-do-not-use-in-production-0000";
