import type { Job } from "bullmq";
import type { Clock, ConnectivityProvider } from "@pms/core";
import { AriStorePerCall, type Db } from "@pms/db";
import { pushProperty, RetryLater, type CircuitBreaker, type RateLimiter } from "@pms/sync";
import type { Logger } from "@pms/runtime";

export interface AriPushDeps {
  db: Db;
  provider: ConnectivityProvider;
  limiter: RateLimiter;
  breaker: CircuitBreaker;
  clock: Clock;
  log: Logger;
  /** One in-flight push per property (spec 04 §4.5). */
  lease: {
    acquire(key: string, ttlMs: number): Promise<boolean>;
    release(key: string): Promise<void>;
  };
  verifySampleRate?: number;
}

export interface AriPushJob {
  orgId: string;
  propertyId: string;
}

/**
 * ari.push processor: serialised per property, coalesced by the outbox dedupe
 * key, retried via delayed re-enqueue on throttle/outage (spec 05 §5.4.4).
 */
export async function processAriPush(deps: AriPushDeps, job: Job<AriPushJob>): Promise<void> {
  const { orgId, propertyId } = job.data;
  const key = `ari:lock:${propertyId}`;
  if (!(await deps.lease.acquire(key, 120_000))) {
    await job.moveToDelayed(Date.now() + 2_000, job.token);
    return;
  }
  try {
    const summary = await pushProperty({
      orgId,
      propertyId,
      provider: deps.provider,
      store: new AriStorePerCall(deps.db, orgId),
      limiter: deps.limiter,
      breaker: deps.breaker,
      clock: deps.clock,
      meta: { dedupeKey: `ari.push:${job.id ?? propertyId}`, requestId: `job:${job.id ?? "?"}` },
      verifySampleRate: deps.verifySampleRate ?? 0.05,
      log: deps.log,
    });
    deps.log.info({ orgId, propertyId, ...summary }, "ari.push.done");
  } catch (e) {
    if (e instanceof RetryLater) {
      deps.log.warn({ orgId, propertyId, delayMs: e.delayMs, reason: e.reason }, "ari.push.retry");
      await job.moveToDelayed(Date.now() + e.delayMs, job.token);
      return;
    }
    throw e;
  } finally {
    await deps.lease.release(key);
  }
}
