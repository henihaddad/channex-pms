import { FakePayoutProvider, type DomainEvent } from "@pms/core";
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
  closeThreadRemote,
  computeAlerts,
  deliverOutbound,
  executePayout,
  nightlyRollups,
  generateDueStatements,
  pollPayouts,
  escalateTurnovers,
  markLiveIfSynced,
  orgsWithAutomation,
  pollReviews,
  pollThreads,
  runAutomation,
  pollChannelHealth,
  propertiesToProvision,
  replanOperations,
  runDailyCloses,
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
  const body = (await req.json().catch(() => ({}))) as {
    orgId?: string;
    dailyClose?: boolean;
    statements?: boolean;
    rollups?: boolean;
  };
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
  const events: DomainEvent[] = [];
  const published = await withoutTenant(c.db.db, (tx) =>
    drainOutbox(
      tx,
      {
        publish: async (e) => {
          events.push(e);
        },
      },
      1000,
    ),
  );
  const opsDeps = { db: c.db.db, clock: c.clock, crypto: c.crypto, lock: c.lock, log };
  let replanned = 0;
  for (const e of events)
    if (e.type === "booking.revision_applied") {
      await replanOperations(opsDeps, e);
      replanned++;
    }
  const escalations = await escalateTurnovers(opsDeps);
  // spec 09: mirror threads and reviews, run automation, deliver what the console queued
  const messagingDeps = {
    db: c.db.db,
    provider: c.provider,
    clock: c.clock,
    crypto: c.crypto,
    log,
    mailer: c.mailer,
  };
  for (const e of events)
    if (e.type === "thread.close") {
      const p = e.payload as { threadId: string; reason: string };
      await closeThreadRemote(
        messagingDeps,
        e.orgId,
        p.threadId,
        p.reason === "no_reply_needed" ? "no_reply_needed" : "resolved",
      );
    }
  const messages = await pollThreads(messagingDeps, body.orgId);
  const reviews = await pollReviews(messagingDeps, body.orgId);
  const automation = { sent: 0, skipped: 0, failed: 0 };
  for (const orgId of await orgsWithAutomation(c.db.db)) {
    if (body.orgId && orgId !== body.orgId) continue;
    const r = await runAutomation(messagingDeps, orgId);
    automation.sent += r.sent;
    automation.skipped += r.skipped;
    automation.failed += r.failed;
  }
  const delivered = body.orgId ? await deliverOutbound(messagingDeps, body.orgId) : null;
  // spec 17: payouts queued by the console run here in tests; statements sweep on request
  const ownerDeps = {
    db: c.db.db,
    clock: c.clock,
    crypto: c.crypto,
    log,
    mailer: c.mailer,
    payouts: c.payouts,
  };
  let payouts = 0;
  for (const e of events)
    if (e.type === "payout.execute") {
      await executePayout(ownerDeps, e.orgId, (e.payload as { payoutId: string }).payoutId);
      payouts++;
    }
  if (c.payouts instanceof FakePayoutProvider) c.payouts.settle();
  const payoutPoll = await pollPayouts(ownerDeps, body.orgId);
  const statements = body.statements ? await generateDueStatements(ownerDeps, body.orgId) : null;
  // spec 11: rollups and alerts on request so dashboards can be asserted without the nightly job
  const analyticsDeps = { db: c.db.db, clock: c.clock, crypto: c.crypto, log, mailer: c.mailer };
  const rollups =
    body.rollups && body.orgId ? await nightlyRollups(analyticsDeps, body.orgId) : null;
  const alerts = body.rollups && body.orgId ? await computeAlerts(analyticsDeps, body.orgId) : null;
  const closes = body.dailyClose
    ? await runDailyCloses({ db: c.db.db, clock: c.clock, log })
    : { closed: 0 };
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
  return Response.json({
    provisioned,
    published,
    pushed,
    live,
    health,
    replanned,
    escalations,
    closes,
    messages,
    reviews,
    automation,
    delivered,
    payouts,
    payoutPoll,
    statements,
    rollups,
    alerts,
  });
});
