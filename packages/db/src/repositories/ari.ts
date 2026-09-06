import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  AriCellStore,
  AvailabilityCell,
  CellOutcome,
  CellRef,
  PendingAri,
  RateCell,
  RestrictionValues,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

/**
 * Cells a push picks up. `in_flight` is included: the per-property lease keeps two pushes
 * apart, so a cell still in flight when a push starts was left behind by a job that died.
 */
const PENDING_STATES = ["pending", "failed", "conflicted", "in_flight"] as const;

type RateRef = Extract<CellRef, { kind: "rate" }>;
type AvailRef = Extract<CellRef, { kind: "availability" }>;
type RateOutcome = Extract<CellOutcome, { kind: "rate" }>;
type AvailOutcome = Extract<CellOutcome, { kind: "availability" }>;

const CHUNK = 1000;
function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}
/** Postgres array literals for unnest(), built from bound values so every driver accepts them. */
const list = (v: Array<string | number>) =>
  sql`array[${sql.join(
    v.map((x) => sql`${x}`),
    sql`, `,
  )}]`;
const ids = (v: string[]) => list(v);
const dates = (v: Array<{ date: string }>) => list(v.map((c) => c.date));
const versions = (v: Array<{ version: number }>) => list(v.map((c) => c.version));
const reasons = (v: CellOutcome[]) =>
  list(v.map((c) => (c.status === "failed" && c.reason !== "retry" ? c.reason : "")));

/**
 * ARI cell store over availability_day / rate_day (spec 05 §5.4.5). Versions
 * make "edited during flight" safe: an outcome applies only when the version
 * it was computed for is still current.
 */
export class DrizzleAriStore implements AriCellStore {
  constructor(private readonly tx: Tx) {}

  /** Local edit path (CAL-3): desired changes, version bumps, state returns to pending. */
  async setRate(
    propertyId: string,
    orgId: string,
    ratePlanId: string,
    date: string,
    values: RestrictionValues,
    source = "manual",
    updatedBy?: string,
  ): Promise<void> {
    await this.tx.execute(sql`
      insert into rate_day (org_id, property_id, rate_plan_id, date, values, sync_state, source, version, updated_by, updated_at)
      values (${orgId}, ${propertyId}, ${ratePlanId}, ${date}, ${JSON.stringify(values)}::jsonb, 'pending', ${source}, 1, ${updatedBy ?? null}, now())
      on conflict (rate_plan_id, date) do update set
        values = rate_day.values || excluded.values, sync_state = 'pending', source = excluded.source,
        version = rate_day.version + 1, updated_by = excluded.updated_by, updated_at = now(), last_error = null`);
  }

  async setAvailability(
    propertyId: string,
    orgId: string,
    roomTypeId: string,
    date: string,
    available: number,
    updatedBy?: string,
  ): Promise<void> {
    await this.tx.execute(sql`
      insert into availability_day (org_id, property_id, room_type_id, date, available, sync_state, version, updated_by, updated_at)
      values (${orgId}, ${propertyId}, ${roomTypeId}, ${date}, ${available}, 'pending', 1, ${updatedBy ?? null}, now())
      on conflict (room_type_id, date) do update set
        available = excluded.available, sync_state = 'pending', version = availability_day.version + 1,
        updated_by = excluded.updated_by, updated_at = now(), last_error = null`);
  }

  async loadPending(propertyId: string): Promise<PendingAri> {
    const rate = await this.tx
      .select({
        ratePlanId: s.rateDay.ratePlanId,
        date: s.rateDay.date,
        values: s.rateDay.values,
        version: s.rateDay.version,
        lastError: s.rateDay.lastError,
      })
      .from(s.rateDay)
      .where(
        and(
          eq(s.rateDay.propertyId, propertyId),
          inArray(s.rateDay.syncState, [...PENDING_STATES]),
        ),
      );
    const availability = await this.tx
      .select({
        roomTypeId: s.availabilityDay.roomTypeId,
        date: s.availabilityDay.date,
        available: s.availabilityDay.available,
        version: s.availabilityDay.version,
        lastError: s.availabilityDay.lastError,
      })
      .from(s.availabilityDay)
      .where(
        and(
          eq(s.availabilityDay.propertyId, propertyId),
          inArray(s.availabilityDay.syncState, [...PENDING_STATES]),
        ),
      );
    return {
      rate: rate
        .filter((r) => r.lastError !== "validation")
        .map((r) => ({
          ratePlanId: r.ratePlanId,
          date: r.date,
          values: r.values,
          version: r.version,
        })),
      availability: availability
        .filter((r) => r.lastError !== "validation")
        .map((r) => ({
          roomTypeId: r.roomTypeId,
          date: r.date,
          availability: r.available,
          version: r.version,
        })),
    };
  }

  async markInFlight(
    _propertyId: string,
    cells: Array<CellRef & { version: number }>,
  ): Promise<void> {
    const rate = cells.filter((c): c is RateRef & { version: number } => c.kind === "rate");
    const avail = cells.filter(
      (c): c is AvailRef & { version: number } => c.kind === "availability",
    );
    for (const chunk of chunks(rate))
      await this.tx.execute(sql`
        update rate_day r set sync_state = 'in_flight', attempts = r.attempts + 1
        from unnest(${ids(chunk.map((c) => c.ratePlanId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(rate_plan_id, date, version)
        where r.rate_plan_id = v.rate_plan_id and r.date = v.date and r.version = v.version`);
    for (const chunk of chunks(avail))
      await this.tx.execute(sql`
        update availability_day a set sync_state = 'in_flight', attempts = a.attempts + 1
        from unnest(${ids(chunk.map((c) => c.roomTypeId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(room_type_id, date, version)
        where a.room_type_id = v.room_type_id and a.date = v.date and a.version = v.version`);
  }

  /**
   * Outcomes are applied in one statement per (kind, outcome) group: a push touches
   * thousands of cells and the worker sits far from the database, so per-cell
   * statements took minutes and jobs died mid-way, leaving cells in flight.
   */
  async applyOutcomes(_propertyId: string, outcomes: CellOutcome[]): Promise<void> {
    const rate = outcomes.filter((o): o is RateOutcome => o.kind === "rate");
    const avail = outcomes.filter((o): o is AvailOutcome => o.kind === "availability");
    const bucket = <T extends CellOutcome>(list: T[]) => ({
      synced: list.filter((o) => o.status === "synced"),
      retry: list.filter((o) => o.status !== "synced" && o.reason === "retry"),
      failed: list.filter((o) => o.status !== "synced" && o.reason !== "retry"),
    });
    const r = bucket(rate);
    const a = bucket(avail);
    for (const chunk of chunks(r.synced))
      await this.tx.execute(sql`
        update rate_day r set sync_state = 'synced', synced_values = r.values, synced_at = now(), last_error = null
        from unnest(${ids(chunk.map((c) => c.ratePlanId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(rate_plan_id, date, version)
        where r.rate_plan_id = v.rate_plan_id and r.date = v.date and r.version = v.version`);
    for (const chunk of chunks(r.retry))
      await this.tx.execute(sql`
        update rate_day r set sync_state = 'pending', last_error = null
        from unnest(${ids(chunk.map((c) => c.ratePlanId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(rate_plan_id, date, version)
        where r.rate_plan_id = v.rate_plan_id and r.date = v.date and r.version = v.version`);
    for (const chunk of chunks(r.failed))
      await this.tx.execute(sql`
        update rate_day r set sync_state = 'failed', last_error = 'validation',
          synced_values = coalesce(r.synced_values, '{}'::jsonb) || jsonb_build_object('_reason', v.reason)
        from unnest(${ids(chunk.map((c) => c.ratePlanId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[], ${reasons(chunk)}::text[]) as v(rate_plan_id, date, version, reason)
        where r.rate_plan_id = v.rate_plan_id and r.date = v.date and r.version = v.version`);
    for (const chunk of chunks(a.synced))
      await this.tx.execute(sql`
        update availability_day a set sync_state = 'synced', synced_available = a.available, synced_at = now(), last_error = null
        from unnest(${ids(chunk.map((c) => c.roomTypeId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(room_type_id, date, version)
        where a.room_type_id = v.room_type_id and a.date = v.date and a.version = v.version`);
    for (const chunk of chunks(a.retry))
      await this.tx.execute(sql`
        update availability_day a set sync_state = 'pending', last_error = null
        from unnest(${ids(chunk.map((c) => c.roomTypeId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(room_type_id, date, version)
        where a.room_type_id = v.room_type_id and a.date = v.date and a.version = v.version`);
    for (const chunk of chunks(a.failed))
      await this.tx.execute(sql`
        update availability_day a set sync_state = 'failed', last_error = 'validation'
        from unnest(${ids(chunk.map((c) => c.roomTypeId))}::uuid[], ${dates(chunk)}::date[], ${versions(chunk)}::int[]) as v(room_type_id, date, version)
        where a.room_type_id = v.room_type_id and a.date = v.date and a.version = v.version`);
  }

  async markConflicted(_propertyId: string, cells: CellRef[]): Promise<void> {
    const rate = cells.filter((c): c is RateRef => c.kind === "rate");
    const avail = cells.filter((c): c is AvailRef => c.kind === "availability");
    for (const chunk of chunks(rate))
      await this.tx.execute(sql`
        update rate_day r set sync_state = 'conflicted', last_error = null
        from unnest(${ids(chunk.map((c) => c.ratePlanId))}::uuid[], ${dates(chunk)}::date[]) as v(rate_plan_id, date)
        where r.rate_plan_id = v.rate_plan_id and r.date = v.date`);
    for (const chunk of chunks(avail))
      await this.tx.execute(sql`
        update availability_day a set sync_state = 'conflicted', last_error = null
        from unnest(${ids(chunk.map((c) => c.roomTypeId))}::uuid[], ${dates(chunk)}::date[]) as v(room_type_id, date)
        where a.room_type_id = v.room_type_id and a.date = v.date`);
  }

  async loadDesired(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ rate: RateCell[]; availability: AvailabilityCell[] }> {
    const rate = await rawRows<{ rate_plan_id: string; date: string; values: RestrictionValues }>(
      this.tx,
      sql`select rate_plan_id, date::text, values from rate_day where property_id = ${propertyId} and date between ${dateFrom} and ${dateTo}`,
    );
    const availability = await rawRows<{ room_type_id: string; date: string; available: number }>(
      this.tx,
      sql`select room_type_id, date::text, available from availability_day where property_id = ${propertyId} and date between ${dateFrom} and ${dateTo}`,
    );
    return {
      rate: rate.map((r) => ({ ratePlanId: r.rate_plan_id, date: r.date, values: r.values })),
      availability: availability.map((a) => ({
        roomTypeId: a.room_type_id,
        date: a.date,
        availability: a.available,
      })),
    };
  }

  /** Sync Health numbers (CX-8). */
  async health(propertyId: string): Promise<Record<string, number>> {
    const rows = await rawRows<{ sync_state: string; n: number }>(
      this.tx,
      sql`
      select sync_state, count(*)::int as n from (
        select sync_state from rate_day where property_id = ${propertyId}
        union all select sync_state from availability_day where property_id = ${propertyId}) x group by sync_state`,
    );
    return Object.fromEntries(rows.map((r) => [r.sync_state, r.n]));
  }
}
