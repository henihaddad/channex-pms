import type { AriCellStore, Clock, ConnectivityProvider, PendingAri } from "@pms/core";
import { AriStorePerCall, asSystem, rawRows, sql, type Db } from "@pms/db";
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
      store: await knownPlansOnly(
        deps.db,
        orgId,
        propertyId,
        new AriStorePerCall(deps.db, orgId),
        deps.log,
      ),
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

/**
 * A rate plan added after setup finished has no provider id until the setup sweep
 * creates it; pushing its cells would make the provider refuse the whole batch and
 * hold every other plan hostage. Those cells stay pending and are pushed once the
 * plan exists. Properties that were never provisioned (tests, fakes) are left alone.
 */
async function knownPlansOnly(
  db: Db,
  orgId: string,
  propertyId: string,
  store: AriCellStore,
  log: Logger,
): Promise<AriCellStore> {
  const rows = await asSystem(db, orgId, (tx) =>
    rawRows<{ id: string; known: boolean }>(
      tx,
      sql`select id, channex_rate_plan_id is not null as known from rate_plan where property_id = ${propertyId} and archived_at is null`,
    ),
  );
  const known = new Set(rows.filter((r) => r.known).map((r) => r.id));
  const unknown = rows.filter((r) => !r.known).map((r) => r.id);
  if (known.size === 0 || unknown.length === 0) return store;
  log.warn({ orgId, propertyId, unknown }, "ari.push.plans_not_provisioned");
  return new Proxy(store, {
    get(target, prop, receiver) {
      if (prop !== "loadPending") return Reflect.get(target, prop, receiver) as unknown;
      return async (id: string): Promise<PendingAri> => {
        const pending = await target.loadPending(id);
        return { ...pending, rate: pending.rate.filter((c) => known.has(c.ratePlanId)) };
      };
    },
  });
}
