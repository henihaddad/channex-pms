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

const PENDING_STATES = ["pending", "failed", "conflicted"] as const;

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
    for (const c of cells) {
      if (c.kind === "rate")
        await this.tx.execute(
          sql`update rate_day set sync_state = 'in_flight', attempts = attempts + 1 where rate_plan_id = ${c.ratePlanId} and date = ${c.date} and version = ${c.version}`,
        );
      else
        await this.tx.execute(
          sql`update availability_day set sync_state = 'in_flight', attempts = attempts + 1 where room_type_id = ${c.roomTypeId} and date = ${c.date} and version = ${c.version}`,
        );
    }
  }

  async applyOutcomes(_propertyId: string, outcomes: CellOutcome[]): Promise<void> {
    for (const o of outcomes) {
      if (o.status === "synced") {
        if (o.kind === "rate")
          await this.tx.execute(
            sql`update rate_day set sync_state = 'synced', synced_values = values, synced_at = now(), last_error = null where rate_plan_id = ${o.ratePlanId} and date = ${o.date} and version = ${o.version}`,
          );
        else
          await this.tx.execute(
            sql`update availability_day set sync_state = 'synced', synced_available = available, synced_at = now(), last_error = null where room_type_id = ${o.roomTypeId} and date = ${o.date} and version = ${o.version}`,
          );
      } else if (o.reason === "retry") {
        if (o.kind === "rate")
          await this.tx.execute(
            sql`update rate_day set sync_state = 'pending' where rate_plan_id = ${o.ratePlanId} and date = ${o.date} and version = ${o.version}`,
          );
        else
          await this.tx.execute(
            sql`update availability_day set sync_state = 'pending' where room_type_id = ${o.roomTypeId} and date = ${o.date} and version = ${o.version}`,
          );
      } else {
        if (o.kind === "rate")
          await this.tx.execute(
            sql`update rate_day set sync_state = 'failed', last_error = 'validation', synced_values = coalesce(synced_values, '{}'::jsonb) || jsonb_build_object('_reason', ${o.reason}::text) where rate_plan_id = ${o.ratePlanId} and date = ${o.date} and version = ${o.version}`,
          );
        else
          await this.tx.execute(
            sql`update availability_day set sync_state = 'failed', last_error = 'validation' where room_type_id = ${o.roomTypeId} and date = ${o.date} and version = ${o.version}`,
          );
      }
    }
  }

  async markConflicted(_propertyId: string, cells: CellRef[]): Promise<void> {
    for (const c of cells) {
      if (c.kind === "rate")
        await this.tx.execute(
          sql`update rate_day set sync_state = 'conflicted', last_error = null where rate_plan_id = ${c.ratePlanId} and date = ${c.date}`,
        );
      else
        await this.tx.execute(
          sql`update availability_day set sync_state = 'conflicted', last_error = null where room_type_id = ${c.roomTypeId} and date = ${c.date}`,
        );
    }
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
