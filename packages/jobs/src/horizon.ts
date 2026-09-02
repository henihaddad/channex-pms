import {
  DEFAULT_HORIZON_DAYS,
  extendHorizon,
  LocalDate,
  type Clock,
  type Id,
  type RestrictionValues,
} from "@pms/core";
import { asSystem, DrizzlePropertyRepository, withoutTenant, type Db } from "@pms/db";
import type { Logger } from "@pms/runtime";
import { orgsWithProperties, queueAriPush } from "./ari-events.js";

/**
 * Rolling horizon (spec 06 §6.7, PROV-5): every live rate plan always has
 * `horizonDays` of cells ahead; new dates copy the same weekday a year earlier.
 */
export async function extendHorizons(deps: {
  db: Db;
  clock: Clock;
  log: Logger;
  horizonDays?: number;
}): Promise<{ plans: number; cells: number }> {
  const days = deps.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const orgs = await withoutTenant(deps.db, (tx) => orgsWithProperties(tx, ["syncing", "live"]));
  let plans = 0;
  let cells = 0;
  for (const orgId of orgs) {
    const ends = await asSystem(deps.db, orgId, (tx) =>
      new DrizzlePropertyRepository(tx, orgId).horizonEnds(),
    );
    const touched = new Set<string>();
    for (const e of ends) {
      const today = deps.clock.today(e.timezone);
      const target = today.plusDays(days - 1);
      const last = LocalDate.parse(e.lastDate);
      if (!last.isBefore(target)) continue;
      const from = last.isBefore(today.minusDays(1)) ? today.minusDays(1) : last;
      const n = await asSystem(deps.db, orgId, async (tx) => {
        const repo = new DrizzlePropertyRepository(tx, orgId);
        const priorYear = await repo.rateCells(
          e.ratePlanId,
          from.plusDays(1).minusDays(364).toString(),
          target.minusDays(364).toString(),
        );
        const lookup = new Map(priorYear.map((c) => [c.date, c.values]));
        const [lastCell] = await repo.rateCells(e.ratePlanId, e.lastDate, e.lastDate);
        const defaults: RestrictionValues = lastCell?.values ?? {
          rate: 10000,
          minStay: 1,
          stopSell: false,
        };
        const newCells = extendHorizon(
          e.ratePlanId,
          from,
          today,
          days,
          (d) => lookup.get(d),
          defaults,
        );
        if (newCells.length === 0) return 0;
        await repo.seedRateCells(e.propertyId as Id, newCells);
        const count = await repo.roomTypeCount(e.roomTypeId);
        await repo.seedAvailability(
          e.propertyId as Id,
          e.roomTypeId as Id,
          newCells[0]!.date,
          newCells.length,
          count,
        );
        return newCells.length;
      });
      if (n > 0) {
        plans++;
        cells += n;
        touched.add(e.propertyId);
      }
    }
    const now = deps.clock.now().epochMilliseconds;
    for (const propertyId of touched)
      await asSystem(deps.db, orgId, (tx) => queueAriPush(tx, orgId, propertyId, now, "horizon"));
  }
  deps.log.info({ plans, cells }, "horizon.extended");
  return { plans, cells };
}
