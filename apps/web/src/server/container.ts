import { createHash } from "node:crypto";
import { SystemClock, type Clock } from "@pms/core";
import { connect, type DbHandle } from "@pms/db";
import {
  argon2Hasher,
  createCrypto,
  createLogger,
  createTokenService,
  loadConfig,
  selectMailer,
  totpVerifier,
  DEV_MASTER_KEY,
  DEV_SESSION_KEY,
  type Config,
  type Logger,
  type TokenService,
} from "@pms/runtime";
import {
  FakeBillingProvider,
  FakeLockProvider,
  FakePaymentProvider,
  FakePayoutProvider,
  type BillingProvider,
  type PaymentProvider,
  type PayoutProvider,
  type ConnectivityProvider,
  type Crypto,
  type LockProvider,
  type Mailer,
  type PasswordHasher,
  type TotpVerifier,
} from "@pms/core";
import {
  StripeBillingProvider,
  StripeConnectPayoutProvider,
  StripePaymentProvider,
  stripeTransport,
  type FakeProvider,
} from "@pms/connectivity";
import { selectProvider } from "@pms/jobs";
import { Redis } from "ioredis";
import { recordingMailer, testHooksEnabled } from "./test-hooks";
import { cfContext } from "./cf-context";

export interface WebContainer {
  config: Config;
  log: Logger;
  clock: Clock;
  db: DbHandle;
  crypto: Crypto;
  hasher: PasswordHasher;
  totp: TotpVerifier;
  mailer: Mailer;
  tokens: TokenService;
  sha256Hex: (s: string) => string;
  /** Channex or the process-wide FakeProvider (spec 05 §5.2). */
  provider: ConnectivityProvider;
  fake?: FakeProvider;
  /** Realtime fan-in from the worker; null without REDIS_URL (the SSE endpoint then polls only). */
  redis: Redis | null;
  /** Smart-lock port (spec 08 §8.4); the fake issues manual door codes until a vendor adapter lands. */
  lock: LockProvider;
  /** Owner payouts (spec 17 §17.4): Stripe Connect with STRIPE_SECRET_KEY, the fake otherwise. */
  payouts: PayoutProvider;
  /** Guest payments (spec 10 §10.4): Stripe PaymentIntents with STRIPE_SECRET_KEY, the fake otherwise. */
  payments: PaymentProvider;
  /** Subscriptions (spec 12 §12.5): Stripe Billing with STRIPE_SECRET_KEY, the fake otherwise. */
  billing: BillingProvider;
  /** Hosted mode has plans and quotas; self-hosted has neither (parity guarantee). */
  hosted: boolean;
}

declare global {
  var __pmsContainer: Promise<WebContainer> | undefined;
}

async function build(): Promise<WebContainer> {
  // ADR-0008: on Workers the database is the Hyperdrive binding, one connection per transaction
  const hyperdrive = cfContext()?.env.HYPERDRIVE;
  if (hyperdrive) {
    process.env.DATABASE_URL = hyperdrive.connectionString;
    process.env.DATABASE_PER_REQUEST = "1";
  }
  const config = loadConfig();
  const log = createLogger({ level: config.LOG_LEVEL, service: "web" });
  const db = await connect();
  if (db.driver === "pglite") {
    // Development without Postgres: the in-process database is migrated on first use.
    await db.migrate();
    log.warn("using in-process PGlite; set DATABASE_URL for a real Postgres");
  }
  const selected = selectProvider(config, process.env, log);
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
    : null;
  redis?.on("error", (e: Error) => log.warn({ err: e.message }, "redis.error"));
  return {
    config,
    log,
    clock: new SystemClock(),
    db,
    provider: selected.provider,
    ...(selected.fake ? { fake: selected.fake } : {}),
    redis,
    lock: new FakeLockProvider(),
    payouts: process.env.STRIPE_SECRET_KEY
      ? new StripeConnectPayoutProvider(stripeTransport(), process.env.STRIPE_SECRET_KEY)
      : new FakePayoutProvider(),
    payments: process.env.STRIPE_SECRET_KEY
      ? new StripePaymentProvider(stripeTransport(), process.env.STRIPE_SECRET_KEY)
      : new FakePaymentProvider(),
    billing: process.env.STRIPE_SECRET_KEY
      ? new StripeBillingProvider(stripeTransport(), process.env.STRIPE_SECRET_KEY)
      : new FakeBillingProvider(),
    hosted: process.env.PMS_MODE === "hosted" || testHooksEnabled(),
    crypto: createCrypto(config.PMS_MASTER_KEY ?? DEV_MASTER_KEY),
    hasher: argon2Hasher,
    totp: totpVerifier,
    mailer: testHooksEnabled()
      ? recordingMailer(selectMailer(config, log))
      : selectMailer(config, log),
    tokens: createTokenService(config.PMS_SESSION_KEY ?? DEV_SESSION_KEY),
    sha256Hex: (s) => createHash("sha256").update(s).digest("hex"),
  };
}

/** Process-wide singleton; survives Next dev HMR via globalThis. */
export function container(): Promise<WebContainer> {
  globalThis.__pmsContainer ??= build();
  return globalThis.__pmsContainer;
}
