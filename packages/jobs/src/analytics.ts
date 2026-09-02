import {
  cancellationSpike,
  channelMix,
  kpis,
  lowOccupancy,
  median,
  Money,
  pace,
  pickup,
  reviewScoreDrop,
  shiftDate,
  slaBreaches,
  statementMismatch,
  syncDegraded,
  unackedBookings,
  zeroBookingChannel,
  type AlertCandidate,
  type Clock,
  type Crypto,
  type DailyFact,
  type KpiSet,
  type LocalDate,
  type Mailer,
} from "@pms/core";
import {
  asSystem,
  DrizzleAnalyticsRepository,
  DrizzleMessagingRepository,
  rawRows,
  sql,
  withoutTenant,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import { pdfDataUri, textPdf } from "./statement-pdf.js";

export interface AnalyticsDeps {
  db: Db;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  mailer: Mailer;
}

const repoFor = (tx: Tx, orgId: string) => new DrizzleAnalyticsRepository(tx, orgId);
const money = (minor: number | null, currency: string): string =>
  minor === null ? "" : `${Money.of(minor, currency).toDecimalString()} ${currency}`;
const pct = (bps: number | null): string => (bps === null ? "" : `${(bps / 100).toFixed(1)}%`);

/** Rebuild facts and the daily aggregate for one org over a date range (both inclusive). */
export async function rollup(
  deps: AnalyticsDeps,
  orgId: string,
  from: string,
  to: string,
  run: (
    fn: (tx: Tx) => Promise<{ nights: number; bookings: number; days: number }>,
  ) => Promise<{ nights: number; bookings: number; days: number }> = (fn) =>
    asSystem(deps.db, orgId, fn),
): Promise<{ nights: number; bookings: number; days: number }> {
  return run((tx) => repoFor(tx, orgId).rebuild(from, to));
}

/** The nightly run (spec 11 §11.5): the last 45 days restated, the next 400 drafted, for every org. */
export async function nightlyRollups(
  deps: AnalyticsDeps,
  orgId?: string,
  window: { pastDays: number; futureDays: number } = { pastDays: 45, futureDays: 400 },
): Promise<{ orgs: number; days: number }> {
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ id: string }>(
            tx,
            sql`select distinct org_id as id from property where archived_at is null`,
          ),
        )
      ).map((r) => r.id);
  const today = deps.clock.today("UTC").toString();
  let days = 0;
  for (const org of orgs) {
    const r = await rollup(
      deps,
      org,
      shiftDate(today, -window.pastDays),
      shiftDate(today, window.futureDays),
    );
    days += r.days;
  }
  return { orgs: orgs.length, days };
}

/** The SnapshotSource the nightly on-the-books job has been waiting for since M0 (RLS scopes the org). */
export function snapshotSource(): {
  onTheBooks: (
    tx: Tx,
    propertyId: string,
    from: LocalDate,
    days: number,
  ) => Promise<
    Array<{
      stayDate: LocalDate;
      roomsAvailable: number;
      roomsSold: number;
      roomRevenueMinor: number;
      currency: string;
    }>
  >;
} {
  return {
    onTheBooks: (tx, propertyId, from, days) =>
      new DrizzleAnalyticsRepository(tx, "").onTheBooks(propertyId, from, days),
  };
}

export interface DashboardKpis {
  period: { from: string; to: string };
  current: KpiSet;
  previous: KpiSet;
  currency: string;
  freshness: string | null;
  channels: ReturnType<typeof channelMix>;
  leadTimeMedianDays: number | null;
  alos: number | null;
  pickup7: { nights: number; revenueMinor: number; baselineDate: string | null };
  pace: ReturnType<typeof pace>;
  snapshotMonths: number;
}

/** KPIs for a range with "compare to previous period", channel mix, pickup and pace, from the rollups (one set of numbers for every screen). */
export async function dashboardKpis(
  tx: Tx,
  orgId: string,
  f: { from: string; to: string; propertyIds?: string[] | null; today: string },
): Promise<DashboardKpis> {
  const repo = repoFor(tx, orgId);
  const span = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000);
  const current = await repo.daily({ from: f.from, to: f.to, propertyIds: f.propertyIds ?? null });
  const previous = await repo.daily({
    from: shiftDate(f.from, -span),
    to: f.from,
    propertyIds: f.propertyIds ?? null,
  });
  const leads = await repo.leadTimes(f.from, f.to);
  const counts = await repo.bookingsCount(f.from, f.to, f.propertyIds ?? null);
  const snaps = await repo.snapshots({
    propertyIds: f.propertyIds ?? null,
    stayFrom: f.from,
    stayTo: f.to,
    snapshotFrom: shiftDate(f.today, -400),
    snapshotTo: f.today,
  });
  const [fresh] = await rawRows<{ at: string | null }>(
    tx,
    sql`select max(computed_at)::text as at from agg_daily_kpi where org_id = ${orgId}`,
  );
  return {
    period: { from: f.from, to: f.to },
    current: kpis(current),
    previous: kpis(previous),
    currency: current[0]?.currency ?? "EUR",
    freshness: fresh?.at ?? null,
    channels: channelMix(await repo.channels(f.from, f.to, f.propertyIds ?? null)),
    leadTimeMedianDays: median(leads.map((l) => l.leadDays)),
    alos: counts.bookings > 0 ? Math.round((counts.nights * 10) / counts.bookings) / 10 : null,
    pickup7: pickup(snaps, { from: f.from, to: f.to }, f.today, 7),
    pace: pace(snaps, { from: f.from, to: f.to }, f.today),
    snapshotMonths: await repo.snapshotMonths(),
  };
}

/** Spec 11 §11.4: evaluate every rule for an org, raise once per condition, resolve what no longer holds. */
export async function computeAlerts(
  deps: AnalyticsDeps,
  orgId: string,
): Promise<{ raised: number; resolved: number }> {
  const today = deps.clock.today("UTC").toString();
  const nowIso = deps.clock.now().toString();
  return asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(tx, orgId);
    const candidates: AlertCandidate[] = [];
    for (const d of await repo.nearDates(today, 8)) {
      const c = lowOccupancy({ ...d });
      if (c) candidates.push(c);
    }
    for (const ch of await repo.channelSilence()) {
      const c = zeroBookingChannel({ ...ch, now: nowIso });
      if (c) candidates.push(c);
    }
    for (const r of await repo.cancellationRates(today)) {
      const c = cancellationSpike(r);
      if (c) candidates.push(c);
    }
    for (const h of await repo.syncHealthByProperty()) {
      const c = syncDegraded(h);
      if (c) candidates.push(c);
    }
    const un = unackedBookings({ orgId, ...(await repo.unacked()) });
    if (un) candidates.push(un);
    const msgs = new DrizzleMessagingRepository(tx, orgId, deps.crypto);
    const sla = slaBreaches({ orgId, breaching: (await msgs.counts("", nowIso)).breaching });
    if (sla) candidates.push(sla);
    for (const r of await repo.reviewAverages(today)) {
      const c = reviewScoreDrop(r);
      if (c) candidates.push(c);
    }
    for (const r of await repo.statementReconciliation()) {
      const c = statementMismatch(r);
      if (c) candidates.push(c);
    }
    const raised = await repo.raise(candidates, today);
    let resolved = 0;
    for (const type of [
      "low_occupancy",
      "zero_booking_channel",
      "cancellation_spike",
      "sync_degraded",
      "unacked_bookings",
      "sla_breaches",
      "review_score_drop",
      "statement_mismatch",
    ] as const)
      resolved += await repo.resolveStale(
        type,
        candidates.filter((c) => c.type === type).map((c) => c.key),
      );
    if (raised > 0) deps.log.info({ orgId, raised, resolved }, "alerts.computed");
    return { raised, resolved };
  });
}

export async function computeAlertsForAll(
  deps: AnalyticsDeps,
): Promise<{ raised: number; resolved: number }> {
  const orgs = (
    await withoutTenant(deps.db, (tx) =>
      rawRows<{ id: string }>(
        tx,
        sql`select distinct org_id as id from property where archived_at is null`,
      ),
    )
  ).map((r) => r.id);
  const out = { raised: 0, resolved: 0 };
  for (const org of orgs) {
    const r = await computeAlerts(deps, org);
    out.raised += r.raised;
    out.resolved += r.resolved;
  }
  return out;
}

/** The statement-to-report reconciliation job (spec 11 §11.3): mismatches become critical alerts. */
export async function reconcileStatements(
  deps: AnalyticsDeps,
  orgId: string,
): Promise<{ checked: number; mismatches: number }> {
  const today = deps.clock.today("UTC").toString();
  return asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(tx, orgId);
    const rows = await repo.statementReconciliation();
    const bad = rows
      .map((r) => statementMismatch(r))
      .filter((c): c is AlertCandidate => c !== null);
    await repo.raise(bad, today);
    return { checked: rows.length, mismatches: bad.length };
  });
}

// ---- report catalogue (spec 11 §11.3) ---------------------------------------------------------------

export interface ReportDefinition {
  key: string;
  name: string;
  group: "commercial" | "operational" | "financial" | "guest";
  /** Which permission gates it in the console. */
  permission: "report:read" | "report:read_financial";
  description: string;
}

export const REPORT_CATALOGUE: ReportDefinition[] = [
  {
    key: "production_by_day",
    name: "Production by day",
    group: "commercial",
    permission: "report:read",
    description: "Rooms available, sold, occupancy, ADR, RevPAR per day.",
  },
  {
    key: "kpi_summary",
    name: "KPI summary",
    group: "commercial",
    permission: "report:read",
    description: "The dictionary's numbers for the range, per property.",
  },
  {
    key: "pace_pickup",
    name: "Pace and pickup",
    group: "commercial",
    permission: "report:read",
    description: "On the books per stay month with 7-day pickup and STLY where snapshots allow.",
  },
  {
    key: "booking_window",
    name: "Booking window",
    group: "commercial",
    permission: "report:read",
    description: "Lead-time distribution per channel.",
  },
  {
    key: "channel_performance",
    name: "Channel performance",
    group: "commercial",
    permission: "report:read",
    description: "Nights, revenue, commission (estimates labelled) and net ADR per channel.",
  },
  {
    key: "arrivals",
    name: "Arrivals manifest",
    group: "operational",
    permission: "report:read",
    description: "Who arrives on a date, with unit and channel.",
  },
  {
    key: "departures",
    name: "Departures manifest",
    group: "operational",
    permission: "report:read",
    description: "Who leaves on a date.",
  },
  {
    key: "in_house",
    name: "In-house manifest",
    group: "operational",
    permission: "report:read",
    description: "Who is staying on a date.",
  },
  {
    key: "sync_health_history",
    name: "Sync health history",
    group: "operational",
    permission: "report:read",
    description: "Channel events per day.",
  },
  {
    key: "unmapped_history",
    name: "Unmapped booking history",
    group: "operational",
    permission: "report:read",
    description: "Bookings that arrived without a mapping.",
  },
  {
    key: "daily_revenue",
    name: "Daily revenue",
    group: "financial",
    permission: "report:read_financial",
    description: "Room revenue, extras, commission and withheld taxes per day (daily close basis).",
  },
  {
    key: "commission_reconciliation",
    name: "Commission reconciliation",
    group: "financial",
    permission: "report:read_financial",
    description: "Reported vs estimated commission per booking.",
  },
  {
    key: "invoice_register",
    name: "Invoice register",
    group: "financial",
    permission: "report:read_financial",
    description: "Invoices and credit notes issued.",
  },
  {
    key: "owner_statement_register",
    name: "Owner statement register",
    group: "financial",
    permission: "report:read_financial",
    description: "Every statement with its reconciliation to the revenue report.",
  },
  {
    key: "guest_repeat",
    name: "Guest history and repeat rate",
    group: "guest",
    permission: "report:read",
    description: "Repeat guests and stays per guest, no contact details.",
  },
  {
    key: "review_scores",
    name: "Review scores",
    group: "guest",
    permission: "report:read",
    description: "Ratings per property and channel by month.",
  },
  {
    key: "message_response",
    name: "Message response performance",
    group: "guest",
    permission: "report:read",
    description: "First-response medians per property and channel.",
  },
];

export interface ReportResult {
  key: string;
  name: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  basis: string;
  generatedAt: string;
}

export interface ReportFilters {
  from: string;
  to: string;
  propertyId?: string | null;
  date?: string | null;
}

const rowOf = (f: DailyFact & { propertyId?: string }, currency: string) => {
  const k = kpis([f]);
  return [
    f.date,
    f.roomsAvailable,
    f.roomsSold,
    pct(k.occupancyBps),
    money(k.adrMinor, currency),
    money(k.revparMinor, currency),
    money(f.roomRevenueMinor, currency),
    money(f.totalRevenueMinor, currency),
  ];
};

/** Run one catalogue report. Every number goes through `kpis()`; the basis is printed on the export (spec 11 §11.5). */
export async function runReport(
  tx: Tx,
  orgId: string,
  crypto: Crypto,
  key: string,
  f: ReportFilters,
): Promise<ReportResult> {
  const repo = repoFor(tx, orgId);
  const def = REPORT_CATALOGUE.find((r) => r.key === key);
  if (!def) throw new Error(`unknown report ${key}`);
  const ids = f.propertyId ? [f.propertyId] : null;
  const generatedAt = new Date().toISOString();
  const base = {
    key,
    name: def.name,
    generatedAt,
    basis:
      "confirmed room-nights by stay date in property-local time; cancellations restate their stay date",
  };
  const scope = f.propertyId ? sql`and b.property_id = ${f.propertyId}` : sql``;
  switch (key) {
    case "production_by_day": {
      const rows = await repo.daily({ from: f.from, to: f.to, propertyIds: ids });
      const byDate = new Map<string, DailyFact[]>();
      for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
      const currency = rows[0]?.currency ?? "EUR";
      return {
        ...base,
        columns: [
          "date",
          "rooms_available",
          "rooms_sold",
          "occupancy",
          "adr",
          "revpar",
          "room_revenue",
          "total_revenue",
        ],
        rows: [...byDate.entries()].sort().map(([date, fs]) =>
          rowOf(
            {
              ...kpis(fs),
              date,
              roomsAvailable: kpis(fs).roomsAvailable,
              roomsSold: kpis(fs).roomsSold,
              roomRevenueMinor: kpis(fs).roomRevenueMinor,
              totalRevenueMinor: kpis(fs).totalRevenueMinor,
              commissionMinor: 0,
              withheldTaxMinor: 0,
              bookingsCreated: 0,
              cancellations: 0,
              arrivals: 0,
              noShows: 0,
              directNights: 0,
            },
            currency,
          ),
        ),
      };
    }
    case "kpi_summary": {
      const league = await repo.league(f.from, f.to);
      return {
        ...base,
        columns: [
          "property",
          "rooms_available",
          "rooms_sold",
          "occupancy",
          "adr",
          "revpar",
          "trevpar",
          "net_adr",
          "direct_share",
          "cancellation_rate",
          "budget_revenue",
          "room_revenue",
        ],
        rows: league
          .filter((p) => !ids || ids.includes(p.propertyId))
          .map((p) => {
            const k = kpis(p.facts);
            return [
              p.title,
              k.roomsAvailable,
              k.roomsSold,
              pct(k.occupancyBps),
              money(k.adrMinor, p.currency),
              money(k.revparMinor, p.currency),
              money(k.trevparMinor, p.currency),
              money(k.netAdrMinor, p.currency),
              pct(k.directShareBps),
              pct(k.cancellationRateBps),
              money(p.budgetRoomRevenueMinor, p.currency),
              money(k.roomRevenueMinor, p.currency),
            ];
          }),
      };
    }
    case "pace_pickup": {
      const today = f.date ?? generatedAt.slice(0, 10);
      const rows: ReportResult["rows"] = [];
      let m = new Date(`${f.from.slice(0, 7)}-01T00:00:00Z`);
      while (m.toISOString().slice(0, 10) < f.to) {
        const from = m.toISOString().slice(0, 10);
        const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
        const to = next.toISOString().slice(0, 10);
        const snaps = await repo.snapshots({
          propertyIds: ids,
          stayFrom: from,
          stayTo: to,
          snapshotFrom: shiftDate(today, -400),
          snapshotTo: today,
        });
        const p = pace(snaps, { from, to }, today);
        const pk = pickup(snaps, { from, to }, today, 7);
        rows.push([
          from.slice(0, 7),
          p.otbNights,
          pk.nights,
          p.available ? p.stlyNights : "n/a (needs a year of snapshots)",
          p.available ? pct(p.deltaBps) : "",
        ]);
        m = next;
      }
      return {
        ...base,
        basis: "on-the-books snapshots taken nightly per property",
        columns: ["stay_month", "otb_nights", "pickup_7d", "stly_nights", "vs_stly"],
        rows,
      };
    }
    case "booking_window": {
      const leads = await repo.leadTimes(f.from, f.to);
      const buckets = ["0", "1-3", "4-7", "8-14", "15-30", "31-60", "61+"];
      const bucket = (d: number) =>
        d <= 0
          ? "0"
          : d <= 3
            ? "1-3"
            : d <= 7
              ? "4-7"
              : d <= 14
                ? "8-14"
                : d <= 30
                  ? "15-30"
                  : d <= 60
                    ? "31-60"
                    : "61+";
      const channels = [...new Set(leads.map((l) => l.channel))].sort();
      return {
        ...base,
        basis: "bookings by booked date",
        columns: ["channel", ...buckets, "median_days"],
        rows: channels.map((c) => {
          const xs = leads.filter((l) => l.channel === c);
          return [
            c,
            ...buckets.map((b) => xs.filter((l) => bucket(l.leadDays) === b).length),
            median(xs.map((l) => l.leadDays)),
          ];
        }),
      };
    }
    case "channel_performance": {
      const mix = channelMix(await repo.channels(f.from, f.to, ids));
      const currency =
        (await repo.daily({ from: f.from, to: f.to, propertyIds: ids }))[0]?.currency ?? "EUR";
      return {
        ...base,
        columns: [
          "channel",
          "nights",
          "night_share",
          "revenue",
          "revenue_share",
          "commission",
          "commission_basis",
          "net_adr",
        ],
        rows: mix.map((m) => [
          m.channel,
          m.nights,
          pct(m.nightShareBps),
          money(m.revenueMinor, currency),
          pct(m.revenueShareBps),
          money(m.commissionMinor, currency),
          m.commissionEstimated ? "estimated" : "reported",
          money(m.netAdrMinor, currency),
        ]),
      };
    }
    case "arrivals":
    case "departures":
    case "in_house": {
      const date = f.date ?? f.from;
      const cond =
        key === "arrivals"
          ? sql`b.arrival_date = ${date}`
          : key === "departures"
            ? sql`b.departure_date = ${date}`
            : sql`b.arrival_date <= ${date} and b.departure_date > ${date}`;
      const rows = await rawRows<{
        property: string;
        guest: string;
        unit: string | null;
        arrival: string;
        departure: string;
        channel: string | null;
        code: string | null;
        state: string;
      }>(
        tx,
        sql`select p.title as property, coalesce(br.guest_names->0->>'name', 'Guest') || ' ' || coalesce(br.guest_names->0->>'surname', '') as guest, u.name as unit, b.arrival_date::text as arrival, b.departure_date::text as departure, b.ota_name as channel, b.ota_reservation_code as code, b.ops_state as state
        from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id left join unit u on u.id = br.assigned_unit_id where b.org_id = ${orgId} and b.status <> 'cancelled' and ${cond} ${scope} order by p.title, guest`,
      );
      return {
        ...base,
        basis: `bookings on ${date}`,
        columns: [
          "property",
          "guest",
          "unit",
          "arrival",
          "departure",
          "channel",
          "reference",
          "state",
        ],
        rows: rows.map((r) => [
          r.property,
          r.guest,
          r.unit,
          r.arrival,
          r.departure,
          r.channel ?? "direct",
          r.code,
          r.state,
        ]),
      };
    }
    case "sync_health_history": {
      const rows = await rawRows<{ day: string; property: string; kind: string; n: number }>(
        tx,
        sql`select e.created_at::date::text as day, p.title as property, e.kind, count(*)::int as n from channel_event e join property p on p.id = e.property_id where e.org_id = ${orgId} and e.created_at >= ${f.from} and e.created_at < ${f.to} ${f.propertyId ? sql`and e.property_id = ${f.propertyId}` : sql``} group by 1, 2, 3 order by 1 desc, 2`,
      ).catch(() => []);
      return {
        ...base,
        basis: "channel events by day",
        columns: ["day", "property", "event", "count"],
        rows: rows.map((r) => [r.day, r.property, r.kind, r.n]),
      };
    }
    case "unmapped_history": {
      const rows = await rawRows<{
        day: string;
        property: string;
        channel: string | null;
        code: string | null;
        state: string;
      }>(
        tx,
        sql`select b.created_at::date::text as day, p.title as property, b.ota_name as channel, b.ota_reservation_code as code, b.mapping_state as state from booking b join property p on p.id = b.property_id where b.org_id = ${orgId} and (b.mapping_state <> 'mapped' or exists (select 1 from booking_revision r where r.booking_id = b.id and r.revision_type = 'new' and r.normalised->'rooms'->0->>'roomTypeId' is null)) and b.created_at >= ${f.from} and b.created_at < ${f.to} ${scope} order by b.created_at desc`,
      );
      return {
        ...base,
        basis: "bookings by received date",
        columns: ["day", "property", "channel", "reference", "mapping_state"],
        rows: rows.map((r) => [r.day, r.property, r.channel, r.code, r.state]),
      };
    }
    case "daily_revenue": {
      const rows = await repo.daily({ from: f.from, to: f.to, propertyIds: ids });
      return {
        ...base,
        columns: [
          "date",
          "property",
          "room_revenue",
          "extras",
          "commission",
          "withheld_tax",
          "net_room_revenue",
        ],
        rows: rows.map((r) => [
          r.date,
          r.propertyId,
          money(r.roomRevenueMinor, r.currency),
          money(r.totalRevenueMinor - r.roomRevenueMinor, r.currency),
          money(r.commissionMinor, r.currency),
          money(r.withheldTaxMinor, r.currency),
          money(r.roomRevenueMinor - r.commissionMinor - r.withheldTaxMinor, r.currency),
        ]),
      };
    }
    case "commission_reconciliation": {
      const rows = await rawRows<{
        property: string;
        code: string | null;
        channel: string;
        total: number;
        reported: number | null;
        estimated: number;
        currency: string;
      }>(
        tx,
        sql`select p.title as property, b.ota_reservation_code as code, fb.channel, fb.total_minor as total, b.ota_commission_minor as reported, coalesce((select sum(f.commission_minor) from fact_room_night f where f.booking_id = fb.booking_id and f.commission_estimated), 0) as estimated, fb.currency
        from fact_booking fb join booking b on b.id = fb.booking_id join property p on p.id = fb.property_id where fb.org_id = ${orgId} and fb.arrival_date >= ${f.from} and fb.arrival_date < ${f.to} ${scope} order by p.title, fb.arrival_date`,
      );
      return {
        ...base,
        basis: "bookings by arrival date",
        columns: [
          "property",
          "reference",
          "channel",
          "total",
          "commission_reported",
          "commission_estimated",
        ],
        rows: rows.map((r) => [
          r.property,
          r.code,
          r.channel,
          money(Number(r.total), r.currency),
          r.reported === null ? "" : money(Number(r.reported), r.currency),
          money(Number(r.estimated), r.currency),
        ]),
      };
    }
    case "invoice_register": {
      const rows = await rawRows<{
        number: string;
        kind: string;
        issued: string;
        property: string;
        total: number;
        currency: string;
      }>(
        tx,
        sql`select i.number, i.kind, i.issued_at::date::text as issued, p.title as property, i.total_minor as total, i.currency from invoice i join property p on p.id = i.property_id where i.org_id = ${orgId} and i.issued_at >= ${f.from} and i.issued_at < ${f.to} ${f.propertyId ? sql`and i.property_id = ${f.propertyId}` : sql``} order by i.issued_at`,
      ).catch(() => []);
      return {
        ...base,
        basis: "invoices by issue date",
        columns: ["number", "kind", "issued", "property", "total"],
        rows: rows.map((r) => [
          r.number,
          r.kind,
          r.issued,
          r.property,
          money(Number(r.total), r.currency),
        ]),
      };
    }
    case "owner_statement_register": {
      const rec = await repo.statementReconciliation();
      const rows = await rawRows<{
        id: string;
        owner: string;
        property: string;
        period: string;
        state: string;
        net: number;
        currency: string;
      }>(
        tx,
        sql`select st.id, o.name as owner, p.title as property, st.period_from::text as period, st.state, (st.totals->>'netDue')::bigint as net, st.currency from owner_statement st join owner o on o.id = st.owner_id join property p on p.id = st.property_id where st.org_id = ${orgId} and st.state <> 'void' and st.period_from >= ${f.from} and st.period_from < ${f.to} order by st.period_from desc, o.name`,
      );
      return {
        ...base,
        basis:
          "statements by period; reconciliation = billed nights net of restatements vs confirmed room revenue",
        columns: [
          "period",
          "owner",
          "property",
          "state",
          "net_due",
          "statement_revenue",
          "report_revenue",
          "reconciled",
        ],
        rows: rows.map((r) => {
          const x = rec.find((y) => y.statementId === r.id);
          return [
            r.period.slice(0, 7),
            r.owner,
            r.property,
            r.state,
            money(Number(r.net), r.currency),
            x ? money(x.statementMinor, r.currency) : "",
            x ? money(x.reportMinor, r.currency) : "",
            x ? (x.statementMinor === x.reportMinor ? "yes" : "NO") : "n/a",
          ];
        }),
      };
    }
    case "guest_repeat": {
      const rows = await rawRows<{
        guest: string;
        stays: number;
        nights: number;
        first: string;
        last: string;
      }>(
        tx,
        sql`select g.id as guest, count(*)::int as stays, sum(b.departure_date - b.arrival_date)::int as nights, min(b.arrival_date)::text as first, max(b.arrival_date)::text as last from booking b join guest g on g.id = b.guest_id where b.org_id = ${orgId} and b.status <> 'cancelled' and b.arrival_date >= ${f.from} and b.arrival_date < ${f.to} ${scope} group by g.id order by stays desc limit 500`,
      );
      const repeat = rows.filter((r) => Number(r.stays) > 1).length;
      return {
        ...base,
        basis: `repeat rate ${rows.length ? Math.round((repeat * 100) / rows.length) : 0}% of ${rows.length} guests; guests are ids, never contact details`,
        columns: ["guest", "stays", "nights", "first_stay", "last_stay"],
        rows: rows.map((r) => [
          r.guest.slice(-8),
          Number(r.stays),
          Number(r.nights),
          r.first,
          r.last,
        ]),
      };
    }
    case "review_scores": {
      const rows = await rawRows<{
        month: string;
        property: string;
        ota: string;
        avg: number;
        n: number;
      }>(
        tx,
        sql`select to_char(r.inserted_at, 'YYYY-MM') as month, p.title as property, r.ota, round(avg(r.rating)::numeric, 2) as avg, count(*)::int as n from review r join property p on p.id = r.property_id where r.org_id = ${orgId} and r.inserted_at >= ${f.from} and r.inserted_at < ${f.to} ${f.propertyId ? sql`and r.property_id = ${f.propertyId}` : sql``} group by 1, 2, 3 order by 1 desc, 2`,
      );
      return {
        ...base,
        basis: "reviews by received month",
        columns: ["month", "property", "channel", "average", "reviews"],
        rows: rows.map((r) => [r.month, r.property, r.ota, Number(r.avg), r.n]),
      };
    }
    case "message_response": {
      const { firstResponseKpi } = await import("./messaging.js");
      const k = await firstResponseKpi(tx, orgId, crypto, `${f.from}T00:00:00Z`);
      return {
        ...base,
        basis: "guest messages by received time; median minutes to the first staff reply",
        columns: ["scope", "name", "median_minutes", "conversations"],
        rows: [
          ["overall", "", k.overall, k.byProperty.reduce((a, p) => a + p.n, 0)],
          ...k.byProperty.map((p) => ["property", p.title, p.median, p.n]),
          ...k.byChannel.map((c) => ["channel", c.provider, c.median, c.n]),
        ],
      };
    }
    default:
      throw new Error(`report ${key} has no runner`);
  }
}

export function toCsv(r: ReportResult): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    [
      `# ${r.name} · generated ${r.generatedAt} · basis: ${r.basis}`,
      r.columns.join(","),
      ...r.rows.map((row) => row.map(esc).join(",")),
    ].join("\n") + "\n"
  );
}

export function toPdf(r: ReportResult): Uint8Array {
  const widths = r.columns.map((c, i) =>
    Math.min(24, Math.max(c.length, ...r.rows.map((row) => String(row[i] ?? "").length))),
  );
  const line = (cells: Array<string | number | null>) =>
    cells
      .map((c, i) =>
        String(c ?? "")
          .slice(0, 24)
          .padEnd(widths[i] ?? 8),
      )
      .join("  ");
  return textPdf(
    [`Generated ${r.generatedAt}`, `Basis: ${r.basis}`, "", line(r.columns), ...r.rows.map(line)],
    { title: r.name },
  );
}

/** Scheduled email reports (spec 11 §11.3): due schedules run against their filters and go out as CSV or PDF. */
export async function sendScheduledReports(deps: AnalyticsDeps, orgId?: string): Promise<number> {
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ id: string }>(
            tx,
            sql`select distinct org_id as id from report_schedule where enabled`,
          ),
        )
      ).map((r) => r.id);
  const today = deps.clock.today("UTC").toString();
  let sent = 0;
  for (const org of orgs) {
    const due = await asSystem(deps.db, org, async (tx) =>
      (await repoFor(tx, org).schedules()).filter(
        (s) => s.enabled && isDue(s.cadence, s.lastSentAt, today),
      ),
    );
    for (const sch of due) {
      const window = sch.cadence === "daily" ? 1 : sch.cadence === "weekly" ? 7 : 30;
      const filters = {
        from: shiftDate(today, -window),
        to: today,
        ...(sch.filters as Partial<ReportFilters>),
      };
      const result = await asSystem(deps.db, org, (tx) =>
        runReport(tx, org, deps.crypto, sch.reportKey, filters),
      );
      const attachment =
        sch.format === "pdf"
          ? pdfDataUri(toPdf(result))
          : `data:text/csv;base64,${Buffer.from(toCsv(result)).toString("base64")}`;
      for (const to of sch.recipients)
        await deps.mailer.send({
          to,
          template: "scheduled_report",
          locale: "en",
          params: {
            name: sch.name,
            report: result.name,
            rows: String(result.rows.length),
            attachment,
          },
        });
      await asSystem(deps.db, org, (tx) => repoFor(tx, org).markScheduleSent(sch.id));
      sent++;
    }
  }
  return sent;
}

function isDue(cadence: string, lastSentAt: string | null, today: string): boolean {
  if (!lastSentAt) return true;
  const last = lastSentAt.slice(0, 10);
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000);
  return cadence === "daily" ? days >= 1 : cadence === "weekly" ? days >= 7 : days >= 28;
}
