import { sql } from "drizzle-orm";
import { rawRows, type Tx } from "../tenant.js";

const num = (v: unknown): number => Number(v ?? 0);

export interface SyncSummary {
  failedCells: number;
  conflictedCells: number;
  pendingCells: number;
  /** Nights a channel accepted from us in the last 24 hours. */
  changesSent24h: number;
  /** Changes sent per hour over the last 24 hours, oldest first. */
  perHour: number[];
  bookingsReceived24h: number;
  unackedBookings: number;
  lastPushAt: string | null;
  lastVerifiedAt: string | null;
  lastDrift: number | null;
  liveProperties: number;
}

export interface DifferingNight {
  propertyTitle: string;
  roomTitle: string;
  planTitle: string | null;
  /** The rate plan's currency; null for availability. */
  currency: string | null;
  kind: "rate" | "availability";
  date: string;
  state: "failed" | "conflicted";
  local: string;
  channel: string;
  lastError: string | null;
}

/**
 * Sync health in a host's words (design canvas "Sync health"): how many nights differ from a
 * channel and which, what we sent and received in the last day, when we last pushed and when we
 * last checked the channel's copy against ours.
 */
export class DrizzleSyncHealthRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  async summary(nowIso: string): Promise<SyncSummary> {
    const since = sql`${nowIso}::timestamptz - interval '24 hours'`;
    const [c] = await rawRows<Record<string, unknown>>(
      this.tx,
      sql`select
        (select count(*) from rate_day where org_id = ${this.orgId} and sync_state = 'failed')::int
          + (select count(*) from availability_day where org_id = ${this.orgId} and sync_state = 'failed')::int as failed,
        (select count(*) from rate_day where org_id = ${this.orgId} and sync_state = 'conflicted')::int
          + (select count(*) from availability_day where org_id = ${this.orgId} and sync_state = 'conflicted')::int as conflicted,
        (select count(*) from rate_day where org_id = ${this.orgId} and sync_state in ('pending', 'in_flight'))::int
          + (select count(*) from availability_day where org_id = ${this.orgId} and sync_state in ('pending', 'in_flight'))::int as pending,
        (select count(*) from rate_day where org_id = ${this.orgId} and synced_at >= ${since})::int
          + (select count(*) from availability_day where org_id = ${this.orgId} and synced_at >= ${since})::int as sent,
        (select count(*) from booking_revision where org_id = ${this.orgId} and received_at >= ${since})::int as received,
        (select count(*) from booking_revision where org_id = ${this.orgId} and acked_at is null and received_at < ${nowIso}::timestamptz - interval '15 minutes')::int as unacked,
        greatest(
          (select max(synced_at) from rate_day where org_id = ${this.orgId}),
          (select max(synced_at) from availability_day where org_id = ${this.orgId})
        )::text as last_push,
        (select max(settings->>'lastVerifiedAt') from property where org_id = ${this.orgId} and archived_at is null) as last_verified,
        (select sum((settings->>'lastDrift')::int) from property where org_id = ${this.orgId} and archived_at is null and settings ? 'lastDrift')::int as last_drift,
        (select count(*) from property where org_id = ${this.orgId} and archived_at is null and state = 'live')::int as live`,
    );
    const hours = await rawRows<{ h: number; n: number }>(
      this.tx,
      sql`select floor(extract(epoch from (${nowIso}::timestamptz - synced_at)) / 3600)::int as h, count(*)::int as n
          from (select synced_at from rate_day where org_id = ${this.orgId} and synced_at >= ${since}
                union all select synced_at from availability_day where org_id = ${this.orgId} and synced_at >= ${since}) x
          group by 1`,
    );
    const perHour = Array.from({ length: 24 }, () => 0);
    for (const r of hours) {
      const h = num(r.h);
      if (h >= 0 && h < 24) perHour[23 - h]! += num(r.n);
    }
    return {
      failedCells: num(c?.failed),
      conflictedCells: num(c?.conflicted),
      pendingCells: num(c?.pending),
      changesSent24h: num(c?.sent),
      perHour,
      bookingsReceived24h: num(c?.received),
      unackedBookings: num(c?.unacked),
      lastPushAt: (c?.last_push as string | null) ?? null,
      lastVerifiedAt: (c?.last_verified as string | null) ?? null,
      lastDrift: c?.last_drift === null || c?.last_drift === undefined ? null : num(c.last_drift),
      liveProperties: num(c?.live),
    };
  }

  /** Nights whose last push failed or whose channel copy differs from ours, oldest night first. */
  async differing(limit = 200): Promise<DifferingNight[]> {
    const rows = await rawRows<{
      property_title: string;
      room_title: string;
      plan_title: string | null;
      currency: string | null;
      kind: "rate" | "availability";
      date: string;
      state: "failed" | "conflicted";
      local: string | null;
      channel: string | null;
      last_error: string | null;
    }>(
      this.tx,
      sql`(select p.title as property_title, rt.title as room_title, rp.title as plan_title, rp.currency, 'rate' as kind,
                  r.date::text as date, r.sync_state as state, r.values::text as local, r.synced_values::text as channel, r.last_error
             from rate_day r join rate_plan rp on rp.id = r.rate_plan_id join room_type rt on rt.id = rp.room_type_id join property p on p.id = r.property_id
            where r.org_id = ${this.orgId} and r.sync_state in ('failed', 'conflicted'))
          union all
          (select p.title, rt.title, null, null, 'availability', a.date::text, a.sync_state, a.available::text, a.synced_available::text, a.last_error
             from availability_day a join room_type rt on rt.id = a.room_type_id join property p on p.id = a.property_id
            where a.org_id = ${this.orgId} and a.sync_state in ('failed', 'conflicted'))
          order by 1, 2, 3 nulls first, 6
          limit ${limit}`,
    );
    return rows.map((r) => ({
      propertyTitle: r.property_title,
      roomTitle: r.room_title,
      planTitle: r.plan_title,
      currency: r.currency,
      kind: r.kind,
      date: r.date,
      state: r.state,
      local: r.local ?? "",
      channel: r.channel ?? "",
      lastError: r.last_error,
    }));
  }
}
