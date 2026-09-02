import {
  AriStorePerCall,
  asSystem,
  DrizzlePropertyRepository,
  drainOutbox,
  rawRows,
  sql,
  withoutTenant,
} from "@pms/db";
import { withIdMap } from "@pms/connectivity";
import {
  markLiveIfSynced,
  pollChannelHealth,
  propertiesToProvision,
  runProvisioning,
} from "@pms/jobs";
import { MemoryCircuitBreaker, pushProperty, TokenBucket } from "@pms/sync";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/**
 * PMS_TEST_HOOKS=1 only: run the worker's M2 jobs in-process against the shared
 * FakeProvider so end-to-end tests on PGlite (no Redis, no worker process) can
 * see provisioning finish, cells reach `synced` and health polls land.
 */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  const body = (await req.json().catch(() => ({}))) as { orgId?: string };
  const log = c.log.child({ hook: "drain" });
  let provisioned = 0;
  for (const p of await propertiesToProvision(c.db.db)) {
    if (body.orgId && p.orgId !== body.orgId) continue;
    try {
      await runProvisioning(
        {
          db: c.db.db,
          provider: c.provider,
          clock: c.clock,
          crypto: c.crypto,
          log,
          callbackBase: c.config.NEXT_PUBLIC_APP_URL,
        },
        p,
      );
      provisioned++;
    } catch (e) {
      log.warn({ err: e instanceof Error ? e.message : String(e) }, "drain.provisioning.failed");
    }
  }
  const published = await withoutTenant(c.db.db, (tx) =>
    drainOutbox(tx, { publish: async () => {} }, 1000),
  );
  const targets = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string; id: string }>(
      tx,
      sql`select distinct p.org_id, p.id from property p where p.archived_at is null and p.state in ('syncing','live') ${body.orgId ? sql`and p.org_id = ${body.orgId}` : sql``}`,
    ),
  );
  let pushed = 0;
  let live = 0;
  for (const t of targets) {
    const idMap = await asSystem(c.db.db, t.org_id, (tx) =>
      new DrizzlePropertyRepository(tx, t.org_id).idMap(t.id),
    );
    const summary = await pushProperty({
      orgId: t.org_id,
      propertyId: t.id,
      provider: withIdMap(c.provider, idMap),
      store: new AriStorePerCall(c.db.db, t.org_id),
      limiter: new TokenBucket(c.clock, { baseRatePerSecond: 1000, burst: 1000 }),
      breaker: new MemoryCircuitBreaker(c.clock, { failureThreshold: 50, cooldownMs: 100 }),
      clock: c.clock,
      meta: { dedupeKey: `drain:${t.id}:${String(Date.now())}`, requestId: "drain" },
      verifySampleRate: 0,
      log,
    });
    if (!summary.skipped) pushed++;
    if (await markLiveIfSynced(c.db.db, t.org_id, t.id)) live++;
  }
  const health = await pollChannelHealth({
    db: c.db.db,
    provider: c.provider,
    clock: c.clock,
    log,
  });
  return Response.json({ provisioned, published, pushed, live, health });
});
