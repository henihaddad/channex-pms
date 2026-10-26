import {
  Id,
  importRates,
  type Clock,
  type RateImportProvider,
  type RateCell,
  type RestrictionValues,
} from "@pms/core";
import {
  asSystem,
  DrizzleAnalyticsRepository,
  DrizzlePropertyRepository,
  DrizzleRateImportRepository,
  rawRows,
  sql,
  withoutTenant,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import { queueAriPush } from "./ari-events.js";

export interface RateImportDeps {
  db: Db;
  clock: Clock;
  log: Logger;
  /**
   * Adapters by name, from the container. Empty until an operator installs one, which is
   * why a scheduled pull does nothing on a stock deployment (spec 06 §6.5b).
   */
  providers: Readonly<Record<string, RateImportProvider>>;
}

export interface RateImportRun {
  propertyId: string;
  provider: string;
  fetched: number;
  cellCount: number;
  applied: boolean;
  refused: number;
  held: number;
  unmapped: number;
  error?: string;
}

/** Every property with a scheduled pull switched on, across tenants. */
async function scheduledProperties(
  db: Db,
): Promise<Array<{ orgId: string; propertyId: string; provider: string }>> {
  return withoutTenant(db, (tx) =>
    rawRows<{ orgId: string; propertyId: string; provider: string }>(
      tx,
      sql`select org_id as "orgId", property_id as "propertyId", provider
          from rate_import_settings where enabled and provider <> 'csv'`,
    ),
  );
}

/**
 * The scheduled pull (spec 06 §6.5b). For each property that asked for one: fetch the
 * window, run it through the guard rails, and then either apply it or — the default —
 * raise it as an alert for a human to look at, which is YR-4's shadow mode.
 *
 * A property whose adapter is not installed is skipped with a recorded error rather than
 * failing the whole run: one tenant's missing plugin is not every tenant's problem.
 */
export async function runScheduledRateImports(
  deps: RateImportDeps,
  windowDays = 365,
): Promise<RateImportRun[]> {
  const out: RateImportRun[] = [];
  for (const row of await scheduledProperties(deps.db)) {
    const provider = deps.providers[row.provider];
    const nowIso = deps.clock.now().toString();
    if (!provider) {
      await asSystem(deps.db, row.orgId, (tx) =>
        new DrizzleRateImportRepository(tx, row.orgId).recordRun(
          row.propertyId,
          nowIso,
          `no adapter installed for "${row.provider}"`,
        ),
      );
      out.push({
        propertyId: row.propertyId,
        provider: row.provider,
        fetched: 0,
        cellCount: 0,
        applied: false,
        refused: 0,
        held: 0,
        unmapped: 0,
        error: "no adapter installed",
      });
      continue;
    }
    try {
      out.push(await runOne(deps, row.orgId, row.propertyId, provider, windowDays, nowIso));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      deps.log.error({ propertyId: row.propertyId, err: error }, "rate_import.failed");
      await asSystem(deps.db, row.orgId, (tx) =>
        new DrizzleRateImportRepository(tx, row.orgId).recordRun(row.propertyId, nowIso, error),
      );
      out.push({
        propertyId: row.propertyId,
        provider: row.provider,
        fetched: 0,
        cellCount: 0,
        applied: false,
        refused: 0,
        held: 0,
        unmapped: 0,
        error,
      });
    }
  }
  return out;
}

async function runOne(
  deps: RateImportDeps,
  orgId: string,
  propertyId: string,
  provider: RateImportProvider,
  windowDays: number,
  nowIso: string,
): Promise<RateImportRun> {
  return asSystem(deps.db, orgId, async (tx: Tx) => {
    const settingsRepo = new DrizzleRateImportRepository(tx, orgId);
    const settings = await settingsRepo.get(propertyId);
    const repo = new DrizzlePropertyRepository(tx, orgId);
    const ratePlanIds = [...new Set(Object.values(settings.mapping))];
    const today = nowIso.slice(0, 10);
    const [horizon] = await rawRows<{ horizon_end: string | null }>(
      tx,
      sql`select max(date)::text as horizon_end from availability_day where property_id = ${propertyId}`,
    );
    const horizonEnd = horizon?.horizon_end ?? today;
    const to = new Date(Date.parse(`${today}T00:00:00Z`) + windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const current = new Map<string, RestrictionValues>();
    for (const id of ratePlanIds)
      for (const c of await repo.rateCells(id, today, horizonEnd))
        current.set(`${id}|${c.date}`, c.values);

    const plan = await importRates(
      provider,
      {
        propertyRef: settings.providerRef ?? propertyId,
        from: today,
        to,
        mapping: new Map(Object.entries(settings.mapping)),
        horizonEnd,
        guardRails: settings.guardRails,
        manualEditedAt: await repo.manualEditedAt(ratePlanIds, today, horizonEnd),
        holdHours: settings.holdHours,
        nowIso,
      },
      current,
    );

    const base = {
      propertyId,
      provider: plan.provider,
      fetched: plan.fetched,
      cellCount: plan.cellCount,
      refused: plan.refused.length,
      held: plan.held.length,
      unmapped: plan.unmapped.length,
    };

    if (settings.autoApply && plan.cellCount > 0) {
      await applyPlan(tx, orgId, propertyId, plan.changes, plan.inverse);
      await settingsRepo.recordRun(propertyId, nowIso, null);
      deps.log.info({ ...base }, "rate_import.applied");
      return { ...base, applied: true };
    }

    // YR-4 shadow mode: nothing is written; the manager is told there is something to look at
    if (plan.cellCount > 0 || plan.refused.length > 0)
      await new DrizzleAnalyticsRepository(tx, orgId).raise(
        [
          {
            type: "rate_import_pending",
            propertyId,
            key: `rate_import:${propertyId}:${today}`,
            severity: plan.refused.length > 0 ? "warning" : "info",
            title: `${plan.provider} proposes ${String(plan.cellCount)} price change(s)`,
            detail: [
              `${String(plan.fetched)} night(s) fetched, ${String(plan.cellCount)} would change`,
              plan.refused.length > 0
                ? `${String(plan.refused.length)} refused by a guard rail`
                : "",
              plan.held.length > 0 ? `${String(plan.held.length)} held after a hand edit` : "",
            ]
              .filter(Boolean)
              .join("; "),
            link: `/properties/${propertyId}/pricing`,
          },
        ],
        today,
      );
    await settingsRepo.recordRun(propertyId, nowIso, null);
    return { ...base, applied: false };
  });
}

/** Through the same ARI path, undo record and push queue as a bulk edit. */
async function applyPlan(
  tx: Tx,
  orgId: string,
  propertyId: string,
  changes: readonly RateCell[],
  inverse: readonly RateCell[],
): Promise<void> {
  const repo = new DrizzlePropertyRepository(tx, orgId);
  await repo.applyRateCells(propertyId, changes, "rate_import");
  await repo.insertBulkOperation({
    id: Id.next(),
    propertyId,
    input: { kind: "rate_import", rows: changes.length },
    cellCount: changes.length,
    inverse: [...inverse],
    // no createdBy: a scheduled pull has no user, and the audit trail says "rate_import"
  });
  await queueAriPush(tx, orgId, propertyId, Date.now(), "rate_import");
}
