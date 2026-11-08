import { shiftDate, weeklyOccupancy, type WeekOccupancy } from "@pms/core";
import { DrizzleAnalyticsRepository, type Tx } from "@pms/db";
import { dashboardKpis, type DashboardKpis } from "./analytics.js";

/**
 * The Reports overview (spec 11 §11.2, design board "Reports"): the dictionary's KPIs for a
 * trailing window against the window before it, occupancy per ISO week over the last
 * thirteen weeks, and revenue by channel. Everything comes from the same rollups as every
 * other screen, through `dashboardKpis`, so the tiles agree with the month overview and
 * the exports.
 */
export interface ReportsOverview {
  window: { from: string; to: string; days: number };
  kpis: DashboardKpis;
  weeks: WeekOccupancy[];
}

export async function reportsOverview(
  tx: Tx,
  orgId: string,
  f: { today: string; days: number; propertyIds: string[] | null },
): Promise<ReportsOverview> {
  const to = shiftDate(f.today, 1);
  const from = shiftDate(to, -f.days);
  const kpis = await dashboardKpis(tx, orgId, {
    from,
    to,
    propertyIds: f.propertyIds,
    today: f.today,
  });
  // thirteen whole ISO weeks ending with the current one
  const dow = (new Date(`${f.today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = shiftDate(f.today, -dow - 12 * 7);
  const daily = await new DrizzleAnalyticsRepository(tx, orgId).daily({
    from: weekStart,
    to: shiftDate(f.today, 7 - dow),
    propertyIds: f.propertyIds,
  });
  return { window: { from, to, days: f.days }, kpis, weeks: weeklyOccupancy(daily) };
}
