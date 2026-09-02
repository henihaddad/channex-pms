import { and, eq, sql } from "drizzle-orm";
import {
  Id,
  LocalDate,
  type DailyFact,
  type Snapshot,
  type ChannelRow,
  type AlertCandidate,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

const num = (v: unknown): number => Number(v ?? 0);
const uuids = (ids: readonly string[]) =>
  ids.length === 0
    ? sql`array[]::uuid[]`
    : sql`array[${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]`;

/** OTA names normalised in SQL exactly as `providerCode` does in core, so facts and screens agree. */
const CHANNEL_SQL = sql`case
  when b.ota_name is null or lower(b.ota_name) in ('', 'direct', 'staff', 'manual', 'website', 'phone', 'walk-in', 'walk_in') then 'direct'
  when lower(b.ota_name) like '%booking%' then 'booking_com'
  when lower(b.ota_name) like '%airbnb%' then 'airbnb'
  when lower(b.ota_name) like '%expedia%' or lower(b.ota_name) like '%hotels.com%' or lower(b.ota_name) like '%vrbo%' then 'expedia'
  else regexp_replace(lower(b.ota_name), '[^a-z0-9]+', '_', 'g') end`;

export interface DailyFactRow extends DailyFact {
  propertyId: string;
  currency: string;
}

export interface PropertyLeagueRow {
  propertyId: string;
  title: string;
  currency: string;
  facts: DailyFact[];
  budgetRoomRevenueMinor: number | null;
  budgetOccupancyBps: number | null;
}

export interface AlertRow {
  id: string;
  propertyId: string | null;
  type: string;
  key: string;
  severity: string;
  title: string;
  detail: string;
  link: string;
  state: string;
  raisedOn: string;
  createdAt: string;
}

/** Rollups, KPI reads, snapshots, alerts, budgets and report schedules (spec 11 §11.5). */
export class DrizzleAnalyticsRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  // ---- rollups ---------------------------------------------------------------------------------

  /**
   * Recompute facts and the daily aggregate for every property of the org over
   * [from, to]. Idempotent: rows in the range are replaced from operational
   * tables, so a cancellation restates its original stay date (spec 11 §11.5).
   */
  async rebuild(
    from: string,
    to: string,
  ): Promise<{ nights: number; bookings: number; days: number }> {
    await this.tx.execute(
      sql`delete from fact_room_night where org_id = ${this.orgId} and date >= ${from} and date <= ${to}`,
    );
    const nights = await this.tx.execute(sql`
      insert into fact_room_night (org_id, property_id, booking_id, date, room_type_id, channel, status, room_revenue_minor, commission_minor, commission_estimated, withheld_tax_minor, lead_days, is_direct, currency)
      select b.org_id, b.property_id, b.id, d.date, min(d.room_type_id::text)::uuid,
             ${CHANNEL_SQL} as channel,
             case when b.status = 'cancelled' or bool_and(d.status = 'cancelled') then 'cancelled'
                  when exists (select 1 from stay_state ss where ss.booking_id = b.id and ss.state = 'no_show') then 'no_show'
                  else 'confirmed' end as status,
             sum(d.amount_minor) as room_revenue_minor,
             case when b.total_amount_minor > 0 then round(sum(d.amount_minor) * coalesce(b.ota_commission_minor, est.minor, 0)::numeric / greatest(b.total_amount_minor, 1)) else 0 end as commission_minor,
             (b.ota_commission_minor is null and est.minor > 0) as commission_estimated,
             case when b.total_amount_minor > 0 then round(sum(d.amount_minor) * coalesce(wt.minor, 0)::numeric / greatest(b.total_amount_minor, 1)) else 0 end as withheld_tax_minor,
             (b.arrival_date - coalesce((select min(r.inserted_at)::date from booking_revision r where r.booking_id = b.id), b.created_at::date)) as lead_days,
             (${CHANNEL_SQL}) = 'direct' as is_direct,
             b.currency
      from booking b
      join booking_room br on br.booking_id = b.id
      join booking_room_day d on d.booking_room_id = br.id
      left join lateral (select case ${CHANNEL_SQL} when 'booking_com' then round(b.total_amount_minor * 0.15) when 'airbnb' then round(b.total_amount_minor * 0.03) when 'expedia' then round(b.total_amount_minor * 0.18) else 0 end as minor) est on true
      left join lateral (select coalesce(sum(round((t->>'amount')::numeric * 100)), 0) as minor from booking_revision r, jsonb_array_elements(coalesce(r.normalised->'taxes', '[]'::jsonb)) t where r.id = b.last_revision_id and (t->>'withheldByOta')::boolean) wt on true
      where b.org_id = ${this.orgId} and b.mapping_state = 'mapped' and d.date >= ${from} and d.date <= ${to}
      group by b.id, d.date, est.minor, wt.minor`);
    await this.tx.execute(
      sql`delete from fact_booking where org_id = ${this.orgId} and booking_id in (select id from booking where org_id = ${this.orgId} and departure_date > ${from} and arrival_date <= ${to})`,
    );
    const bookings = await this.tx.execute(sql`
      insert into fact_booking (org_id, property_id, booking_id, channel, booked_date, arrival_date, departure_date, nights, status, total_minor, room_revenue_minor, commission_minor, lead_days, cancelled_date, currency)
      select b.org_id, b.property_id, b.id, ${CHANNEL_SQL},
             coalesce((select min(r.inserted_at)::date from booking_revision r where r.booking_id = b.id), b.created_at::date) as booked_date,
             b.arrival_date, b.departure_date, (b.departure_date - b.arrival_date),
             case when b.status = 'cancelled' then 'cancelled' when exists (select 1 from stay_state ss where ss.booking_id = b.id and ss.state = 'no_show') then 'no_show' else 'confirmed' end,
             b.total_amount_minor,
             coalesce((select sum(d.amount_minor) from booking_room br join booking_room_day d on d.booking_room_id = br.id where br.booking_id = b.id and d.status = 'confirmed'), 0),
             coalesce(b.ota_commission_minor, 0),
             (b.arrival_date - coalesce((select min(r.inserted_at)::date from booking_revision r where r.booking_id = b.id), b.created_at::date)),
             case when b.status = 'cancelled' then coalesce(b.last_revision_inserted_at::date, b.updated_at::date) else null end,
             b.currency
      from booking b where b.org_id = ${this.orgId} and b.mapping_state = 'mapped' and b.departure_date > ${from} and b.arrival_date <= ${to}`);
    await this.tx.execute(
      sql`delete from agg_daily_kpi where org_id = ${this.orgId} and date >= ${from} and date <= ${to}`,
    );
    const days = await this.tx.execute(sql`
      insert into agg_daily_kpi (org_id, property_id, date, rooms_available, rooms_sold, room_revenue_minor, total_revenue_minor, commission_minor, withheld_tax_minor, bookings_created, cancellations, arrivals, no_shows, direct_nights, currency, computed_at)
      select p.org_id, p.id, dd.date,
             greatest(0, coalesce((select sum(rt.count_of_rooms) from room_type rt where rt.property_id = p.id), 0)
               - coalesce((select count(*) from unit_block ub where ub.property_id = p.id and ub.cancelled_at is null and ub.reduces_availability and ub.reason in ('maintenance', 'renovation') and ub.date_from <= dd.date and ub.date_to > dd.date), 0)) as rooms_available,
             coalesce((select count(*) from fact_room_night f where f.property_id = p.id and f.date = dd.date and f.status = 'confirmed'), 0),
             coalesce((select sum(f.room_revenue_minor) from fact_room_night f where f.property_id = p.id and f.date = dd.date and f.status = 'confirmed'), 0),
             coalesce((select sum(f.room_revenue_minor) from fact_room_night f where f.property_id = p.id and f.date = dd.date and f.status = 'confirmed'), 0)
               + coalesce((select sum(fl.amount_minor) from folio_line fl join folio fo on fo.id = fl.folio_id where fo.property_id = p.id and fl.date = dd.date and fl.kind not in ('room', 'room_revenue', 'payment', 'deposit')), 0),
             coalesce((select sum(f.commission_minor) from fact_room_night f where f.property_id = p.id and f.date = dd.date and f.status = 'confirmed'), 0),
             coalesce((select sum(f.withheld_tax_minor) from fact_room_night f where f.property_id = p.id and f.date = dd.date and f.status = 'confirmed'), 0),
             coalesce((select count(*) from fact_booking fb where fb.property_id = p.id and fb.booked_date = dd.date), 0),
             coalesce((select count(*) from fact_booking fb where fb.property_id = p.id and fb.cancelled_date = dd.date), 0),
             coalesce((select count(*) from fact_booking fb where fb.property_id = p.id and fb.arrival_date = dd.date and fb.status <> 'cancelled'), 0),
             coalesce((select count(*) from fact_booking fb where fb.property_id = p.id and fb.arrival_date = dd.date and fb.status = 'no_show'), 0),
             coalesce((select count(*) from fact_room_night f where f.property_id = p.id and f.date = dd.date and f.status = 'confirmed' and f.is_direct), 0),
             p.currency, now()
      from property p cross join (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as date) dd
      where p.org_id = ${this.orgId} and p.archived_at is null`);
    const count = (r: unknown) =>
      num((r as { rowCount?: number }).rowCount ?? (Array.isArray(r) ? r.length : 0));
    return { nights: count(nights), bookings: count(bookings), days: count(days) };
  }

  // ---- reads --------------------------------------------------------------------------------------

  async daily(f: {
    from: string;
    to: string;
    propertyIds?: string[] | null;
  }): Promise<DailyFactRow[]> {
    const rows = await rawRows<{
      property_id: string;
      date: string;
      rooms_available: number;
      rooms_sold: number;
      room_revenue_minor: number;
      total_revenue_minor: number;
      commission_minor: number;
      withheld_tax_minor: number;
      bookings_created: number;
      cancellations: number;
      arrivals: number;
      no_shows: number;
      direct_nights: number;
      currency: string;
    }>(
      this.tx,
      sql`select property_id, date::text, rooms_available, rooms_sold, room_revenue_minor, total_revenue_minor, commission_minor, withheld_tax_minor, bookings_created, cancellations, arrivals, no_shows, direct_nights, currency
          from agg_daily_kpi where org_id = ${this.orgId} and date >= ${f.from} and date < ${f.to} ${f.propertyIds ? sql`and property_id = any(${uuids(f.propertyIds)})` : sql``} order by property_id, date`,
    );
    return rows.map((r) => ({
      propertyId: r.property_id,
      date: r.date,
      roomsAvailable: num(r.rooms_available),
      roomsSold: num(r.rooms_sold),
      roomRevenueMinor: num(r.room_revenue_minor),
      totalRevenueMinor: num(r.total_revenue_minor),
      commissionMinor: num(r.commission_minor),
      withheldTaxMinor: num(r.withheld_tax_minor),
      bookingsCreated: num(r.bookings_created),
      cancellations: num(r.cancellations),
      arrivals: num(r.arrivals),
      noShows: num(r.no_shows),
      directNights: num(r.direct_nights),
      currency: r.currency,
    }));
  }

  /** The same numbers straight from the SQL aggregate, for the equivalence test (spec 11 §11.6). */
  async occupancyFromSql(
    from: string,
    to: string,
    propertyId: string | null,
  ): Promise<number | null> {
    const [r] = await rawRows<{ bps: number | null }>(
      this.tx,
      sql`select case when sum(rooms_available) > 0 then round(sum(rooms_sold)::numeric * 10000 / sum(rooms_available)) else null end as bps
          from agg_daily_kpi where org_id = ${this.orgId} and date >= ${from} and date < ${to} ${propertyId ? sql`and property_id = ${propertyId}` : sql``}`,
    );
    return r?.bps === null || r?.bps === undefined ? null : num(r.bps);
  }

  async league(from: string, to: string): Promise<PropertyLeagueRow[]> {
    const props = await rawRows<{ id: string; title: string; currency: string }>(
      this.tx,
      sql`select id, title, currency from property where org_id = ${this.orgId} and archived_at is null order by title`,
    );
    const facts = await this.daily({ from, to });
    const budgets = await rawRows<{ property_id: string; revenue: number; occ: number | null }>(
      this.tx,
      sql`select property_id, sum(room_revenue_minor) as revenue, avg(occupancy_bps)::int as occ from budget where org_id = ${this.orgId} and month >= date_trunc('month', ${from}::date) and month < ${to}::date group by property_id`,
    );
    return props.map((p) => {
      const b = budgets.find((x) => x.property_id === p.id);
      return {
        propertyId: p.id,
        title: p.title,
        currency: p.currency,
        facts: facts.filter((f) => f.propertyId === p.id),
        budgetRoomRevenueMinor: b ? num(b.revenue) : null,
        budgetOccupancyBps: b?.occ ?? null,
      };
    });
  }

  async channels(from: string, to: string, propertyIds?: string[] | null): Promise<ChannelRow[]> {
    const rows = await rawRows<{
      channel: string;
      nights: number;
      revenue: number;
      commission: number;
      estimated: boolean;
    }>(
      this.tx,
      sql`select channel, count(*)::int as nights, sum(room_revenue_minor) as revenue, sum(commission_minor) as commission, bool_or(commission_estimated) as estimated
          from fact_room_night where org_id = ${this.orgId} and status = 'confirmed' and date >= ${from} and date < ${to} ${propertyIds ? sql`and property_id = any(${uuids(propertyIds)})` : sql``} group by channel order by nights desc`,
    );
    return rows.map((r) => ({
      channel: r.channel,
      nights: num(r.nights),
      revenueMinor: num(r.revenue),
      commissionMinor: num(r.commission),
      commissionEstimated: r.estimated,
    }));
  }

  async leadTimes(from: string, to: string): Promise<Array<{ channel: string; leadDays: number }>> {
    const rows = await rawRows<{ channel: string; lead_days: number }>(
      this.tx,
      sql`select channel, lead_days from fact_booking where org_id = ${this.orgId} and booked_date >= ${from} and booked_date < ${to} and status <> 'cancelled'`,
    );
    return rows.map((r) => ({ channel: r.channel, leadDays: num(r.lead_days) }));
  }

  async bookingsCount(
    from: string,
    to: string,
    propertyIds?: string[] | null,
  ): Promise<{ bookings: number; nights: number }> {
    const [r] = await rawRows<{ bookings: number; nights: number }>(
      this.tx,
      sql`select count(*)::int as bookings, coalesce(sum(nights), 0)::int as nights from fact_booking where org_id = ${this.orgId} and status = 'confirmed' and arrival_date >= ${from} and arrival_date < ${to} ${propertyIds ? sql`and property_id = any(${uuids(propertyIds)})` : sql``}`,
    );
    return { bookings: num(r?.bookings), nights: num(r?.nights) };
  }

  // ---- snapshots (pace, pickup) --------------------------------------------------------------

  /** SnapshotSource for the nightly job: rooms available and sold per stay date from live inventory and bookings. */
  async onTheBooks(
    propertyId: string,
    from: LocalDate,
    days: number,
  ): Promise<
    Array<{
      stayDate: LocalDate;
      roomsAvailable: number;
      roomsSold: number;
      roomRevenueMinor: number;
      currency: string;
    }>
  > {
    const to = from.plusDays(days).toString();
    const rows = await rawRows<{
      date: string;
      available: number;
      sold: number;
      revenue: number;
      currency: string;
    }>(
      this.tx,
      sql`select dd.date::date::text as date, greatest(0, coalesce((select sum(rt.count_of_rooms) from room_type rt where rt.property_id = ${propertyId}), 0)
             - coalesce((select count(*) from unit_block ub where ub.property_id = ${propertyId} and ub.cancelled_at is null and ub.reduces_availability and ub.reason in ('maintenance', 'renovation') and ub.date_from <= dd.date and ub.date_to > dd.date), 0))::int as available,
             coalesce((select count(*) from booking_room_day d join booking_room br on br.id = d.booking_room_id join booking b on b.id = br.booking_id where b.property_id = ${propertyId} and b.status <> 'cancelled' and d.status = 'confirmed' and d.date = dd.date), 0)::int as sold,
             coalesce((select sum(d.amount_minor) from booking_room_day d join booking_room br on br.id = d.booking_room_id join booking b on b.id = br.booking_id where b.property_id = ${propertyId} and b.status <> 'cancelled' and d.status = 'confirmed' and d.date = dd.date), 0) as revenue,
             (select currency from property where id = ${propertyId}) as currency
          from (select generate_series(${from.toString()}::date, ${to}::date - 1, interval '1 day')::date as date) dd`,
    );
    return rows.map((r) => ({
      stayDate: LocalDate.parse(r.date),
      roomsAvailable: num(r.available),
      roomsSold: num(r.sold),
      roomRevenueMinor: num(r.revenue),
      currency: r.currency,
    }));
  }

  async snapshots(f: {
    propertyIds?: string[] | null;
    stayFrom: string;
    stayTo: string;
    snapshotFrom: string;
    snapshotTo: string;
  }): Promise<Snapshot[]> {
    const rows = await rawRows<{
      stay_date: string;
      snapshot_date: string;
      sold: number;
      revenue: number;
    }>(
      this.tx,
      sql`select stay_date::text, snapshot_date::text, sum(rooms_sold)::int as sold, sum(room_revenue_minor) as revenue from otb_snapshot
          where org_id = ${this.orgId} and stay_date >= ${f.stayFrom} and stay_date < ${f.stayTo} and snapshot_date >= ${f.snapshotFrom} and snapshot_date <= ${f.snapshotTo}
          ${f.propertyIds ? sql`and property_id = any(${uuids(f.propertyIds)})` : sql``} group by stay_date, snapshot_date`,
    );
    return rows.map((r) => ({
      stayDate: r.stay_date,
      snapshotDate: r.snapshot_date,
      roomsSold: num(r.sold),
      roomRevenueMinor: num(r.revenue),
    }));
  }

  async snapshotMonths(): Promise<number> {
    const [r] = await rawRows<{ months: number | null }>(
      this.tx,
      sql`select (extract(year from age(max(snapshot_date), min(snapshot_date))) * 12 + extract(month from age(max(snapshot_date), min(snapshot_date))))::int as months from otb_snapshot where org_id = ${this.orgId}`,
    );
    return num(r?.months);
  }

  // ---- today (realtime deltas off operational tables) -----------------------------------------

  async today(
    today: string,
    propertyIds?: string[] | null,
  ): Promise<{
    arrivals: number;
    departures: number;
    inHouse: number;
    occupancyTonightBps: number | null;
    roomsAvailable: number;
    roomsSoldTonight: number;
    revenueTodayMinor: number;
    recentBookings: Array<{
      id: string;
      propertyTitle: string;
      channel: string;
      arrivalDate: string;
      departureDate: string;
      totalMinor: number;
      currency: string;
      createdAt: string;
    }>;
  }> {
    const scope = propertyIds ? sql`and b.property_id = any(${uuids(propertyIds)})` : sql``;
    const [c] = await rawRows<{
      arrivals: number;
      departures: number;
      in_house: number;
      revenue: number;
    }>(
      this.tx,
      sql`select count(*) filter (where b.arrival_date = ${today} and b.status <> 'cancelled')::int as arrivals,
                 count(*) filter (where b.departure_date = ${today} and b.status <> 'cancelled')::int as departures,
                 count(*) filter (where b.arrival_date <= ${today} and b.departure_date > ${today} and b.status <> 'cancelled')::int as in_house,
                 coalesce((select sum(d.amount_minor) from booking_room_day d join booking_room br on br.id = d.booking_room_id join booking b2 on b2.id = br.booking_id where b2.org_id = ${this.orgId} and b2.status <> 'cancelled' and d.status = 'confirmed' and d.date = ${today} ${propertyIds ? sql`and b2.property_id = any(${uuids(propertyIds)})` : sql``}), 0) as revenue
          from booking b where b.org_id = ${this.orgId} ${scope}`,
    );
    const [inv] = await rawRows<{ available: number }>(
      this.tx,
      sql`select coalesce(sum(rt.count_of_rooms), 0)::int as available from room_type rt join property p on p.id = rt.property_id where p.org_id = ${this.orgId} and p.archived_at is null ${propertyIds ? sql`and p.id = any(${uuids(propertyIds)})` : sql``}`,
    );
    const recent = await rawRows<{
      id: string;
      property_title: string;
      ota_name: string | null;
      arrival_date: string;
      departure_date: string;
      total_amount_minor: number;
      currency: string;
      created_at: string;
    }>(
      this.tx,
      sql`select b.id, p.title as property_title, b.ota_name, b.arrival_date::text, b.departure_date::text, b.total_amount_minor, b.currency, b.created_at::text from booking b join property p on p.id = b.property_id
          where b.org_id = ${this.orgId} and b.created_at > now() - interval '24 hours' ${scope} order by b.created_at desc limit 20`,
    );
    const sold = num(c?.in_house);
    const available = num(inv?.available);
    return {
      arrivals: num(c?.arrivals),
      departures: num(c?.departures),
      inHouse: sold,
      roomsAvailable: available,
      roomsSoldTonight: sold,
      occupancyTonightBps: available > 0 ? Math.round((sold * 10_000) / available) : null,
      revenueTodayMinor: num(c?.revenue),
      recentBookings: recent.map((r) => ({
        id: r.id,
        propertyTitle: r.property_title,
        channel: r.ota_name ?? "direct",
        arrivalDate: r.arrival_date,
        departureDate: r.departure_date,
        totalMinor: num(r.total_amount_minor),
        currency: r.currency,
        createdAt: r.created_at,
      })),
    };
  }

  /** The action queue (spec 11 §11.2): what needs a human now. */
  async actionQueue(today: string): Promise<{
    unmapped: number;
    failedCells: number;
    conflictedCells: number;
    pendingCells: number;
    unassignedArrivals: number;
    breachingMessages: number;
    unackedRevisions: number;
    openAlerts: number;
    expiringCards: number;
    openDisputes: number;
  }> {
    const [r] = await rawRows<Record<string, number>>(
      this.tx,
      sql`select
        (select count(*) from booking where org_id = ${this.orgId} and mapping_state <> 'mapped' and status <> 'cancelled')::int as unmapped,
        (select count(*) from rate_day where org_id = ${this.orgId} and sync_state = 'failed')::int + (select count(*) from availability_day where org_id = ${this.orgId} and sync_state = 'failed')::int as failed_cells,
        (select count(*) from rate_day where org_id = ${this.orgId} and sync_state = 'conflicted')::int + (select count(*) from availability_day where org_id = ${this.orgId} and sync_state = 'conflicted')::int as conflicted_cells,
        (select count(*) from rate_day where org_id = ${this.orgId} and sync_state = 'pending')::int + (select count(*) from availability_day where org_id = ${this.orgId} and sync_state = 'pending')::int as pending_cells,
        (select count(*) from booking b join booking_room br on br.booking_id = b.id join property p on p.id = b.property_id where b.org_id = ${this.orgId} and b.status <> 'cancelled' and p.kind <> 'single_unit' and br.assigned_unit_id is null and b.arrival_date >= ${today} and b.arrival_date < ${today}::date + 7)::int as unassigned_arrivals,
        (select count(*) from message_thread where org_id = ${this.orgId} and state = 'open' and first_response_due_at < now() and (last_outbound_at is null or last_outbound_at < last_inbound_at))::int as breaching_messages,
        (select count(*) from booking_revision where org_id = ${this.orgId} and acked_at is null and received_at < now() - interval '15 minutes')::int as unacked_revisions,
        (select count(*) from alert where org_id = ${this.orgId} and state = 'open')::int as open_alerts,
        (select count(*) from payment_instrument where org_id = ${this.orgId} and vcc_effective_to is not null and vcc_effective_to < now() + interval '7 days' and vcc_effective_to > now())::int as expiring_cards,
        (select count(*) from owner_statement where org_id = ${this.orgId} and dispute_state = 'open')::int as open_disputes`,
    );
    return {
      unmapped: num(r?.unmapped),
      failedCells: num(r?.failed_cells),
      conflictedCells: num(r?.conflicted_cells),
      pendingCells: num(r?.pending_cells),
      unassignedArrivals: num(r?.unassigned_arrivals),
      breachingMessages: num(r?.breaching_messages),
      unackedRevisions: num(r?.unacked_revisions),
      openAlerts: num(r?.open_alerts),
      expiringCards: num(r?.expiring_cards),
      openDisputes: num(r?.open_disputes),
    };
  }

  // ---- alert inputs (spec 11 §11.4) -----------------------------------------------------------------

  async nearDates(
    today: string,
    days: number,
  ): Promise<
    Array<{
      propertyId: string;
      propertyTitle: string;
      date: string;
      occupancyBps: number | null;
      daysOut: number;
    }>
  > {
    const rows = await rawRows<{
      property_id: string;
      title: string;
      date: string;
      bps: number | null;
      days_out: number;
    }>(
      this.tx,
      sql`select k.property_id, p.title, k.date::text, case when k.rooms_available > 0 then round(k.rooms_sold::numeric * 10000 / k.rooms_available)::int else null end as bps, (k.date - ${today}::date) as days_out
          from agg_daily_kpi k join property p on p.id = k.property_id where k.org_id = ${this.orgId} and k.date >= ${today} and k.date < ${today}::date + ${days}::int and p.state = 'live'`,
    );
    return rows.map((r) => ({
      propertyId: r.property_id,
      propertyTitle: r.title,
      date: r.date,
      occupancyBps: r.bps === null ? null : num(r.bps),
      daysOut: num(r.days_out),
    }));
  }

  async channelSilence(): Promise<
    Array<{
      connectionId: string;
      propertyId: string;
      propertyTitle: string;
      channel: string;
      activeSince: string;
      lastBookingAt: string | null;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_id: string;
      title: string;
      adapter_code: string;
      created_at: string;
      last: string | null;
    }>(
      this.tx,
      sql`select c.id, c.property_id, p.title, c.adapter_code, c.created_at::text, (select max(b.created_at)::text from booking b where b.property_id = c.property_id and (b.channel_connection_id = c.id or lower(b.ota_name) like '%' || lower(split_part(c.adapter_code, '_', 1)) || '%')) as last
          from channel_connection c join property p on p.id = c.property_id where c.org_id = ${this.orgId} and c.state = 'active' and c.archived_at is null`,
    );
    return rows.map((r) => ({
      connectionId: r.id,
      propertyId: r.property_id,
      propertyTitle: r.title,
      channel: r.adapter_code,
      activeSince: r.created_at,
      lastBookingAt: r.last,
    }));
  }

  async cancellationRates(today: string): Promise<
    Array<{
      propertyId: string;
      propertyTitle: string;
      channel: string;
      recentRateBps: number | null;
      baselineRateBps: number | null;
      recentBookings: number;
    }>
  > {
    const rows = await rawRows<{
      property_id: string;
      title: string;
      channel: string;
      recent_bookings: number;
      recent_cancelled: number;
      base_bookings: number;
      base_cancelled: number;
    }>(
      this.tx,
      sql`select fb.property_id, p.title, fb.channel,
             count(*) filter (where fb.booked_date >= ${today}::date - 30)::int as recent_bookings,
             count(*) filter (where fb.booked_date >= ${today}::date - 30 and fb.status = 'cancelled')::int as recent_cancelled,
             count(*) filter (where fb.booked_date < ${today}::date - 30 and fb.booked_date >= ${today}::date - 395)::int as base_bookings,
             count(*) filter (where fb.booked_date < ${today}::date - 30 and fb.booked_date >= ${today}::date - 395 and fb.status = 'cancelled')::int as base_cancelled
          from fact_booking fb join property p on p.id = fb.property_id where fb.org_id = ${this.orgId} group by fb.property_id, p.title, fb.channel`,
    );
    const bps = (n: number, d: number) => (d > 0 ? Math.round((n * 10_000) / d) : null);
    return rows.map((r) => ({
      propertyId: r.property_id,
      propertyTitle: r.title,
      channel: r.channel,
      recentRateBps: bps(num(r.recent_cancelled), num(r.recent_bookings)),
      baselineRateBps: bps(num(r.base_cancelled), num(r.base_bookings)),
      recentBookings: num(r.recent_bookings),
    }));
  }

  async syncHealthByProperty(): Promise<
    Array<{
      propertyId: string;
      propertyTitle: string;
      failed: number;
      conflicted: number;
      pending: number;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      title: string;
      failed: number;
      conflicted: number;
      pending: number;
    }>(
      this.tx,
      sql`select p.id, p.title,
             (select count(*) from rate_day r where r.property_id = p.id and r.sync_state = 'failed')::int + (select count(*) from availability_day a where a.property_id = p.id and a.sync_state = 'failed')::int as failed,
             (select count(*) from rate_day r where r.property_id = p.id and r.sync_state = 'conflicted')::int + (select count(*) from availability_day a where a.property_id = p.id and a.sync_state = 'conflicted')::int as conflicted,
             (select count(*) from rate_day r where r.property_id = p.id and r.sync_state = 'pending')::int + (select count(*) from availability_day a where a.property_id = p.id and a.sync_state = 'pending')::int as pending
          from property p where p.org_id = ${this.orgId} and p.state = 'live' and p.archived_at is null`,
    );
    return rows.map((r) => ({
      propertyId: r.id,
      propertyTitle: r.title,
      failed: num(r.failed),
      conflicted: num(r.conflicted),
      pending: num(r.pending),
    }));
  }

  async unacked(): Promise<{ count: number; oldestMinutes: number }> {
    const [r] = await rawRows<{ n: number; oldest: number | null }>(
      this.tx,
      sql`select count(*)::int as n, coalesce(extract(epoch from (now() - min(received_at))) / 60, 0)::int as oldest from booking_revision where org_id = ${this.orgId} and acked_at is null`,
    );
    return { count: num(r?.n), oldestMinutes: num(r?.oldest) };
  }

  async reviewAverages(today: string): Promise<
    Array<{
      propertyId: string;
      propertyTitle: string;
      recentAvg: number | null;
      baselineAvg: number | null;
    }>
  > {
    const rows = await rawRows<{
      property_id: string;
      title: string;
      recent: number | null;
      baseline: number | null;
    }>(
      this.tx,
      sql`select r.property_id, p.title, avg(r.rating) filter (where r.inserted_at >= ${today}::date - 30) as recent, avg(r.rating) filter (where r.inserted_at < ${today}::date - 30) as baseline
          from review r join property p on p.id = r.property_id where r.org_id = ${this.orgId} group by r.property_id, p.title`,
    );
    return rows.map((r) => ({
      propertyId: r.property_id,
      propertyTitle: r.title,
      recentAvg: r.recent === null ? null : Number(r.recent),
      baselineAvg: r.baseline === null ? null : Number(r.baseline),
    }));
  }

  /** Statement-to-report reconciliation input (spec 11 §11.3): billed nights net of later restatements vs the report's confirmed revenue. */
  async statementReconciliation(): Promise<
    Array<{
      statementId: string;
      propertyId: string;
      propertyTitle: string;
      period: string;
      statementMinor: number;
      reportMinor: number;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_id: string;
      title: string;
      period_from: string;
      billed: number;
      restated: number;
      report: number;
    }>(
      this.tx,
      sql`select st.id, st.property_id, p.title, st.period_from::text,
             coalesce((select sum(l.amount_minor) from owner_statement_line l where l.statement_id = st.id and l.kind = 'booking_revenue'), 0) as billed,
             coalesce((select sum(l.amount_minor) from owner_statement_line l join owner_statement st2 on st2.id = l.statement_id where st2.agreement_key = st.agreement_key and st2.state <> 'void' and l.kind = 'adjustment' and l.basis->>'originStatementId' = st.id::text), 0) as restated,
             coalesce((select sum(f.room_revenue_minor) from fact_room_night f where f.property_id = st.property_id and f.status = 'confirmed' and f.date >= st.period_from and f.date < st.period_to), 0) as report
          from owner_statement st join property p on p.id = st.property_id
          join owner_agreement a on a.agreement_key = st.agreement_key and a.version = 1
          where st.org_id = ${this.orgId} and st.state in ('sent', 'paid') and a.unit_ids is null`,
    );
    return rows.map((r) => ({
      statementId: r.id,
      propertyId: r.property_id,
      propertyTitle: r.title,
      period: r.period_from.slice(0, 7),
      statementMinor: num(r.billed) + num(r.restated),
      reportMinor: num(r.report),
    }));
  }

  // ---- alerts -------------------------------------------------------------------------------------------

  async raise(candidates: readonly AlertCandidate[], today: string): Promise<number> {
    let raised = 0;
    for (const c of candidates) {
      const [open] = await rawRows<{ id: string }>(
        this.tx,
        sql`select id from alert where org_id = ${this.orgId} and type = ${c.type} and key = ${c.key} and state in ('open', 'acknowledged') limit 1`,
      );
      if (open) continue; // ALRT-1: one live alert per condition
      const rows = await this.tx
        .insert(s.alert)
        .values({
          id: Id.next(),
          orgId: this.orgId,
          propertyId: c.propertyId,
          type: c.type,
          key: c.key,
          severity: c.severity,
          title: c.title,
          detail: c.detail,
          link: c.link,
          raisedOn: today,
        })
        .onConflictDoNothing({
          target: [s.alert.orgId, s.alert.type, s.alert.key, s.alert.raisedOn],
        })
        .returning({ id: s.alert.id });
      raised += rows.length;
    }
    return raised;
  }

  async alerts(state: string | null = null, limit = 100): Promise<AlertRow[]> {
    const rows = await rawRows<{
      id: string;
      property_id: string | null;
      type: string;
      key: string;
      severity: string;
      title: string;
      detail: string;
      link: string;
      state: string;
      raised_on: string;
      created_at: string;
    }>(
      this.tx,
      sql`select id, property_id, type, key, severity, title, detail, link, state, raised_on::text, created_at::text from alert where org_id = ${this.orgId} ${state ? sql`and state = ${state}` : sql``} order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, created_at desc limit ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      type: r.type,
      key: r.key,
      severity: r.severity,
      title: r.title,
      detail: r.detail,
      link: r.link,
      state: r.state,
      raisedOn: r.raised_on,
      createdAt: r.created_at,
    }));
  }

  async setAlertState(
    id: string,
    state: "acknowledged" | "actioned" | "resolved",
    userId: string,
  ): Promise<void> {
    await this.tx.execute(
      sql`update alert set state = ${state}, acknowledged_by = coalesce(acknowledged_by, ${userId}), acknowledged_at = coalesce(acknowledged_at, now()), resolved_at = case when ${state !== "acknowledged"} then now() else resolved_at end where id = ${id} and org_id = ${this.orgId}`,
    );
  }

  /** Auto-resolve open alerts whose condition no longer holds. */
  async resolveStale(type: string, liveKeys: readonly string[]): Promise<number> {
    const r = await this.tx.execute(
      sql`update alert set state = 'resolved', resolved_at = now() where org_id = ${this.orgId} and type = ${type} and state in ('open', 'acknowledged') and not (key = any(${sql`array[${sql.join(
        [...liveKeys, "__none__"].map((k) => sql`${k}::text`),
        sql`, `,
      )}]`}))`,
    );
    return num((r as { rowCount?: number }).rowCount);
  }

  async alertStats(days = 90): Promise<Array<{ type: string; raised: number; actioned: number }>> {
    const rows = await rawRows<{ type: string; raised: number; actioned: number }>(
      this.tx,
      sql`select type, count(*)::int as raised, count(*) filter (where state = 'actioned')::int as actioned from alert where org_id = ${this.orgId} and created_at > now() - (${days}::text || ' days')::interval group by type`,
    );
    return rows.map((r) => ({ type: r.type, raised: num(r.raised), actioned: num(r.actioned) }));
  }

  // ---- budgets and schedules ------------------------------------------------------------------------

  async upsertBudget(b: {
    propertyId: string;
    month: string;
    roomRevenueMinor: number;
    occupancyBps: number | null;
    createdBy: string;
  }): Promise<void> {
    await this.tx
      .insert(s.budget)
      .values({ id: Id.next(), orgId: this.orgId, ...b })
      .onConflictDoUpdate({
        target: [s.budget.propertyId, s.budget.month],
        set: { roomRevenueMinor: b.roomRevenueMinor, occupancyBps: b.occupancyBps },
      });
  }

  async schedules(): Promise<Array<typeof s.reportSchedule.$inferSelect>> {
    return this.tx
      .select()
      .from(s.reportSchedule)
      .where(eq(s.reportSchedule.orgId, this.orgId))
      .orderBy(s.reportSchedule.createdAt);
  }

  async saveSchedule(x: {
    reportKey: string;
    name: string;
    filters: Record<string, unknown>;
    recipients: string[];
    cadence: "daily" | "weekly" | "monthly";
    format: "csv" | "pdf";
    createdBy: string;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.reportSchedule).values({ id, orgId: this.orgId, ...x });
    return id;
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.tx
      .delete(s.reportSchedule)
      .where(and(eq(s.reportSchedule.id, id), eq(s.reportSchedule.orgId, this.orgId)));
  }

  async markScheduleSent(id: string): Promise<void> {
    await this.tx
      .update(s.reportSchedule)
      .set({ lastSentAt: sql`now()` })
      .where(eq(s.reportSchedule.id, id));
  }
}
