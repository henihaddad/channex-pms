import type { Clock, ConnectivityProvider } from "@pms/core";
import { AriStorePerCall, type Db } from "@pms/db";
import { verify, type CircuitBreaker, type RateLimiter } from "@pms/sync";
import type { Logger } from "@pms/runtime";
import { LocalDate } from "@pms/core";

export const RECONCILE_HORIZON_DAYS = 365;

/** Nightly drift check per property (spec 05 §5.4.6 #1): read back, compare, mark conflicted so cells re-enter the pipeline. */
export async function reconcileProperty(
  deps: {
    db: Db;
    provider: ConnectivityProvider;
    limiter: RateLimiter;
    breaker: CircuitBreaker;
    clock: Clock;
    log: Logger;
  },
  orgId: string,
  propertyId: string,
  timezone: string,
  jobId: string,
): Promise<number> {
  const today = deps.clock.today(timezone);
  const drift = await verify(
    {
      orgId,
      propertyId,
      provider: deps.provider,
      store: new AriStorePerCall(deps.db, orgId),
      limiter: deps.limiter,
      breaker: deps.breaker,
      clock: deps.clock,
      meta: { dedupeKey: `reconcile:${jobId}`, requestId: `job:${jobId}` },
      log: deps.log,
    },
    today.toString(),
    today.plusDays(RECONCILE_HORIZON_DAYS).toString(),
  );
  deps.log.info({ orgId, propertyId, drift }, "ari.reconcile.done");
  return drift;
}

export { LocalDate };
