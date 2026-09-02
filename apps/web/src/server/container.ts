import { createHash } from "node:crypto";
import { SystemClock, type Clock } from "@pms/core";
import { connect, type DbHandle } from "@pms/db";
import {
  argon2Hasher,
  consoleMailer,
  createCrypto,
  createLogger,
  createTokenService,
  loadConfig,
  totpVerifier,
  DEV_MASTER_KEY,
  DEV_SESSION_KEY,
  type Config,
  type Logger,
  type TokenService,
} from "@pms/runtime";
import type { Crypto, Mailer, PasswordHasher, TotpVerifier } from "@pms/core";
import { recordingMailer, testHooksEnabled } from "./test-hooks";

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
}

declare global {
  var __pmsContainer: Promise<WebContainer> | undefined;
}

async function build(): Promise<WebContainer> {
  const config = loadConfig();
  const log = createLogger({ level: config.LOG_LEVEL, service: "web" });
  const db = await connect();
  if (db.driver === "pglite") {
    // Development without Postgres: the in-process database is migrated on first use.
    await db.migrate();
    log.warn("using in-process PGlite; set DATABASE_URL for a real Postgres");
  }
  return {
    config,
    log,
    clock: new SystemClock(),
    db,
    crypto: createCrypto(config.PMS_MASTER_KEY ?? DEV_MASTER_KEY),
    hasher: argon2Hasher,
    totp: totpVerifier,
    mailer: testHooksEnabled() ? recordingMailer(consoleMailer(log)) : consoleMailer(log),
    tokens: createTokenService(config.PMS_SESSION_KEY ?? DEV_SESSION_KEY),
    sha256Hex: (s) => createHash("sha256").update(s).digest("hex"),
  };
}

/** Process-wide singleton; survives Next dev HMR via globalThis. */
export function container(): Promise<WebContainer> {
  globalThis.__pmsContainer ??= build();
  return globalThis.__pmsContainer;
}
