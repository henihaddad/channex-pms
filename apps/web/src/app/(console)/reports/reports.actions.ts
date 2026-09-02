"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { kpis, KPI_DICTIONARY, type KpiDefinition, type KpiKey } from "@pms/core";
import { DrizzleMessagingRepository, type AlertRow, type PropertyLeagueRow } from "@pms/db";
import {
  dashboardKpis,
  REPORT_CATALOGUE,
  rollup,
  runReport,
  type DashboardKpis,
  type ReportDefinition,
  type ReportResult,
} from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { analytics, dashboardRole, monthWindow, type DashboardRole } from "@/server/analytics";

const org = { scope: "organization" as const, audit: false };
const today = () => new Date().toISOString().slice(0, 10);

export interface DashboardData {
  role: DashboardRole;
  today: string;
  month: DashboardKpis;
  board: Awaited<ReturnType<ReturnType<typeof analytics>["today"]>>;
  queue: Awaited<ReturnType<ReturnType<typeof analytics>["actionQueue"]>>;
  next7: Array<{ date: string; occupancyBps: number | null }>;
  league: Array<PropertyLeagueRow & { kpi: ReturnType<typeof kpis>; outlier: boolean }>;
  alerts: AlertRow[];
  inbox: { needsReply: number; breaching: number };
  dictionary: Record<KpiKey, KpiDefinition>;
  properties: Array<{ id: string; title: string }>;
}

/** Every role dashboard reads the same rollups (spec 11 §11.2); widgets the role cannot see are simply not rendered. */
export const loadDashboard = withPermission<[{ propertyId?: string | null }], DashboardData>(
  "report:read",
  org,
  async (ctx, f) => {
    const c = await container();
    const repo = analytics(ctx);
    const t = today();
    const w = monthWindow(t);
    const ids = f.propertyId ? [f.propertyId] : null;
    const month = await dashboardKpis(ctx.tx, ctx.orgId, { ...w, propertyIds: ids, today: t });
    const next = await repo.daily({ from: t, to: shift(t, 7), propertyIds: ids });
    const byDate = new Map<string, typeof next>();
    for (const r of next) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    const league = (await repo.league(w.from, w.to)).map((p) => ({
      ...p,
      kpi: kpis(p.facts),
      outlier: false,
    }));
    const lastYear = await repo.daily({ from: shift(w.from, -365), to: shift(w.to, -365) });
    for (const p of league) {
      const ly = kpis(lastYear.filter((x) => x.propertyId === p.propertyId));
      p.outlier = ly.roomRevenueMinor > 0 && p.kpi.roomRevenueMinor < ly.roomRevenueMinor * 0.9;
    }
    const msgs = new DrizzleMessagingRepository(ctx.tx, ctx.orgId, c.crypto);
    const counts = await msgs.counts(ctx.userId, new Date().toISOString());
    return {
      role: await dashboardRole(ctx),
      today: t,
      month,
      board: await repo.today(t, ids),
      queue: await repo.actionQueue(t),
      next7: [...byDate.entries()]
        .sort()
        .map(([date, rows]) => ({ date, occupancyBps: kpis(rows).occupancyBps })),
      league: league.sort((a, b) => (b.kpi.revparMinor ?? -1) - (a.kpi.revparMinor ?? -1)),
      alerts: await repo.alerts("open", 10),
      inbox: { needsReply: counts.needsReply, breaching: counts.breaching },
      dictionary: KPI_DICTIONARY as Record<KpiKey, KpiDefinition>,
      properties: league.map((p) => ({ id: p.propertyId, title: p.title })),
    };
  },
);

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** "Refresh now": the rollup for the last 45 days and the horizon, on demand (the nightly job does the same). */
export const refreshRollupsAction = withPermission<[FormData], void>(
  "report:read",
  { scope: "organization" },
  async (ctx) => {
    const t = today();
    await rollup(
      {
        db: (await container()).db.db,
        clock: (await container()).clock,
        crypto: (await container()).crypto,
        log: ctx.log,
        mailer: (await container()).mailer,
      },
      ctx.orgId,
      shift(t, -45),
      shift(t, 400),
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/", "layout");
  },
);

export const listReports = withPermission<
  [],
  {
    catalogue: ReportDefinition[];
    schedules: Awaited<ReturnType<ReturnType<typeof analytics>["schedules"]>>;
    properties: Array<{ id: string; title: string }>;
  }
>("report:read", org, async (ctx) => {
  const repo = analytics(ctx);
  const league = await repo.league(today(), today());
  return {
    catalogue: REPORT_CATALOGUE,
    schedules: await repo.schedules(),
    properties: league.map((p) => ({ id: p.propertyId, title: p.title })),
  };
});

const filtersSchema = z.object({
  key: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  propertyId: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});
async function gatedReport(ctx: ActorCtx, key: string): Promise<ReportDefinition> {
  const def = REPORT_CATALOGUE.find((r) => r.key === key);
  if (!def) throw new HttpProblem(404, "not_found", "Unknown report");
  return def;
}

/** Operational reports; financial ones go through `runFinancialReport` so the matrix's `report:read_financial` gates them. */
export const runOperationalReport = withPermission<[z.infer<typeof filtersSchema>], ReportResult>(
  "report:read",
  { ...org, schema: filtersSchema },
  async (ctx, f) => {
    const def = await gatedReport(ctx, f.key);
    if (def.permission !== "report:read")
      throw new HttpProblem(403, "financial", "This is a financial report");
    const c = await container();
    return runReport(ctx.tx, ctx.orgId, c.crypto, f.key, {
      from: f.from,
      to: f.to,
      propertyId: f.propertyId ?? null,
      date: f.date ?? null,
    });
  },
);

export const runFinancialReport = withPermission<[z.infer<typeof filtersSchema>], ReportResult>(
  "report:read_financial",
  { ...org, schema: filtersSchema },
  async (ctx, f) => {
    await gatedReport(ctx, f.key);
    const c = await container();
    return runReport(ctx.tx, ctx.orgId, c.crypto, f.key, {
      from: f.from,
      to: f.to,
      propertyId: f.propertyId ?? null,
      date: f.date ?? null,
    });
  },
);

export const saveScheduleAction = withPermission<[FormData], void>(
  "report:read",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "report_schedule", id: String(fd.get("reportKey")) }),
  },
  async (ctx, fd) => {
    const recipients = String(fd.get("recipients") ?? "")
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter((x) => x.includes("@"));
    if (recipients.length === 0)
      throw new HttpProblem(422, "recipients", "Add at least one email address");
    const cadence = String(fd.get("cadence") ?? "weekly");
    await analytics(ctx).saveSchedule({
      reportKey: String(fd.get("reportKey")),
      name: String(fd.get("name") ?? "") || String(fd.get("reportKey")),
      filters: fd.get("propertyId") ? { propertyId: String(fd.get("propertyId")) } : {},
      recipients,
      cadence: cadence === "daily" ? "daily" : cadence === "monthly" ? "monthly" : "weekly",
      format: fd.get("format") === "pdf" ? "pdf" : "csv",
      createdBy: ctx.userId,
    });
    revalidatePath("/reports");
  },
);

export const deleteScheduleAction = withPermission<[FormData], void>(
  "report:read",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "report_schedule", id: String(fd.get("id")) }),
  },
  async (ctx, fd) => {
    await analytics(ctx).deleteSchedule(String(fd.get("id")));
    revalidatePath("/reports");
  },
);

export const saveBudgetAction = withPermission<[FormData], void>(
  "report:read_financial",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
  },
  async (ctx, fd) => {
    const month = String(fd.get("month") ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpProblem(422, "month", "Pick a month");
    await analytics(ctx).upsertBudget({
      propertyId: String(fd.get("propertyId")),
      month: `${month}-01`,
      roomRevenueMinor: Math.round(Number(fd.get("roomRevenue") ?? 0) * 100),
      occupancyBps: fd.get("occupancy") ? Math.round(Number(fd.get("occupancy")) * 100) : null,
      createdBy: ctx.userId,
    });
    revalidatePath("/reports");
  },
);

export const listAlerts = withPermission<
  [{ state?: string | null }],
  { rows: AlertRow[]; stats: Array<{ type: string; raised: number; actioned: number }> }
>("report:read", org, async (ctx, f) => {
  const repo = analytics(ctx);
  return { rows: await repo.alerts(f.state ?? null, 200), stats: await repo.alertStats() };
});

export const alertStateAction = withPermission<[FormData], void>(
  "report:read",
  { scope: "organization", subject: (fd) => ({ kind: "alert", id: String(fd.get("id")) }) },
  async (ctx, fd) => {
    const state = String(fd.get("state"));
    if (state !== "acknowledged" && state !== "actioned" && state !== "resolved")
      throw new HttpProblem(422, "state", "Unknown state");
    await analytics(ctx).setAlertState(String(fd.get("id")), state, ctx.userId);
    revalidatePath("/alerts");
    revalidatePath("/");
  },
);
