import { createHash } from "node:crypto";
import {
  FakeBillingProvider,
  FakeLockProvider,
  FakePaymentProvider,
  FakePayoutProvider,
  SystemClock,
} from "@pms/core";
import {
  StripeBillingProvider,
  StripeConnectPayoutProvider,
  StripePaymentProvider,
  stripeTransport,
} from "@pms/connectivity";
import { queueEnqueue } from "@pms/cloudflare";
import { connectPg } from "@pms/db";
import {
  buildWorkerDeps,
  selectProvider,
  type Enqueue,
  type WorkerDeps,
  type WorkerWiring,
} from "@pms/jobs";
import {
  createCrypto,
  createLogger,
  loadConfig,
  selectMailer,
  type Config,
  type Logger,
} from "@pms/runtime";
import { MemoryCircuitBreaker, TokenBucket } from "@pms/sync";
import { durableLease, type PropertyLease } from "./lease.js";

export interface Env {
  HYPERDRIVE: Hyperdrive;
  LEASE: DurableObjectNamespace<PropertyLease>;
  [key: string]: unknown;
}

export interface Runtime {
  config: Config;
  log: Logger;
  wiring: WorkerWiring;
  deps: WorkerDeps;
  enqueue: Enqueue;
}

/** String vars and secrets, the 12-factor view the shared runtime expects. */
function processEnv(env: Env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(env)) if (typeof v === "string") out[k] = v;
  out.DATABASE_URL = env.HYPERDRIVE.connectionString;
  out.DATABASE_PER_REQUEST = "1";
  return out;
}

let cached: Runtime | undefined;

/**
 * Built once per isolate. Nothing here holds a socket: the database handle
 * opens one connection per transaction, the lease lives in a Durable Object.
 * The limiter and breaker are per isolate, conservative by construction.
 */
export function runtime(env: Env): Runtime {
  if (cached) return cached;
  const penv = processEnv(env);
  const config = loadConfig(penv);
  const log = createLogger({ level: config.LOG_LEVEL, service: "worker-cf" });
  const db = connectPg(env.HYPERDRIVE.connectionString, { perRequest: true }).db;
  const clock = new SystemClock();
  const { provider, kind } = selectProvider(config, penv, log);
  const stripeKey = penv.STRIPE_SECRET_KEY;
  const wiring: WorkerWiring = {
    db,
    provider,
    clock,
    crypto: createCrypto(config.PMS_MASTER_KEY ?? ""),
    log,
    mailer: selectMailer(config, log),
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
    limiter: new TokenBucket(clock, { baseRatePerSecond: 5, burst: 10 }),
    breaker: new MemoryCircuitBreaker(clock, { failureThreshold: 5, cooldownMs: 60_000 }),
    lease: durableLease(env.LEASE),
    sha256Hex: (s) => createHash("sha256").update(s).digest("hex"),
    appUrl: config.NEXT_PUBLIC_APP_URL,
    sellerCountry: penv.PMS_SELLER_COUNTRY ?? "PT",
    realtime: null,
  };
  log.info({ provider: kind }, "worker-cf.ready");
  cached = { config, log, wiring, deps: buildWorkerDeps(wiring), enqueue: queueEnqueue(env) };
  return cached;
}
