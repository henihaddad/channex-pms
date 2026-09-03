import type { Clock, ConnectivityProvider } from "@pms/core";
import { AriStorePerCall, type Db } from "@pms/db";
import { pushProperty, RetryLater, type CircuitBreaker, type RateLimiter } from "@pms/sync";
import type { Logger } from "@pms/runtime";
import type { Lease } from "./lease.js";

export interface AriPushDeps {
  db: Db;
  provider: ConnectivityProvider;
  limiter: RateLimiter;
  breaker: CircuitBreaker;
  clock: Clock;
  log: Logger;
  lease: Lease;
  verifySampleRate?: number;
}

export interface AriPushJob {
  orgId: string;
  propertyId: string;
}

/** What a processor may ask of the queue it runs on, whichever queue that is (BullMQ, Cloudflare Queues, the test SimQueue). */
export interface JobControl {
  id: string;
  /** Re-run this job after the delay instead of completing it. */
  delay(ms: number): Promise<void>;
}

/**
 * ari.push processor: serialised per property, coalesced by the outbox dedupe
 * key, retried via delayed re-enqueue on throttle/outage (spec 05 §5.4.4).
 */
export async function processAriPush(
  deps: AriPushDeps,
  data: AriPushJob,
  ctl: JobControl,
): Promise<void> {
  const { orgId, propertyId } = data;
  const key = `ari:lock:${propertyId}`;
  if (!(await deps.lease.acquire(key, 120_000))) {
    await ctl.delay(2_000);
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
      meta: { dedupeKey: `ari.push:${ctl.id}`, requestId: `job:${ctl.id}` },
      verifySampleRate: deps.verifySampleRate ?? 0.05,
      log: deps.log,
    });
    deps.log.info({ orgId, propertyId, ...summary }, "ari.push.done");
  } catch (e) {
    if (e instanceof RetryLater) {
      deps.log.warn({ orgId, propertyId, delayMs: e.delayMs, reason: e.reason }, "ari.push.retry");
      await ctl.delay(e.delayMs);
      return;
    }
    throw e;
  } finally {
    await deps.lease.release(key);
  }
}
