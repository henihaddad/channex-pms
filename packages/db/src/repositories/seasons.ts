import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { SeasonRange, YearNight } from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface SeasonRow {
  id: string;
  /** null: an organization-wide season every property shares. */
  propertyId: string | null;
  name: string;
  ranges: SeasonRange[];
  colour: string;
}

/** Seasons (spec 06 §6.6): a property's own and the organization's shared ones. */
export class DrizzleSeasonRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  async list(propertyId: string): Promise<SeasonRow[]> {
    const rows = await this.tx
      .select()
      .from(s.season)
      .where(or(eq(s.season.propertyId, propertyId), isNull(s.season.propertyId)));
    return rows
      .map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        name: r.name,
        ranges: [...r.dateRanges].sort((a, b) => (a.from < b.from ? -1 : 1)),
        colour: r.colour,
      }))
      .sort((a, b) => ((a.ranges[0]?.from ?? "") < (b.ranges[0]?.from ?? "") ? -1 : 1));
  }

  async add(row: SeasonRow): Promise<void> {
    await this.tx.insert(s.season).values({
      id: row.id,
      orgId: this.orgId,
      propertyId: row.propertyId,
      name: row.name.trim(),
      dateRanges: row.ranges,
      colour: row.colour,
    });
  }

  async remove(id: string, propertyId: string): Promise<void> {
    await this.tx
      .delete(s.season)
      .where(and(eq(s.season.id, id), eq(s.season.propertyId, propertyId)));
  }
}

/**
 * One listing's year, night by night (spec 06 §6.2 year view): sellable units after blocks,
 * units booked, and its base plan's price, minimum stay and stop-sell. Two scans over the
 * range, not one query per night.
 */
export async function loadYearNights(
  tx: Tx,
  propertyId: string,
  from: string,
  to: string,
): Promise<{
  nights: YearNight[];
  revenueMinor: number;
  blocked: Array<{ reason: string; nights: number }>;
  ratePlanTitle: string | null;
}> {
  const [plan] = await rawRows<{ id: string; title: string }>(
    tx,
    sql`select id, title from rate_plan where property_id = ${propertyId} and archived_at is null and parent_rate_plan_id is null order by created_at, id limit 1`,
  );
  const rows = await rawRows<{
    date: string;
    sellable: number;
    booked: number;
    amount: string | number;
    rate: string | number | null;
    min_stay: number | null;
    closed: boolean | null;
  }>(
    tx,
    sql`with d as (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as date),
      rooms as (select coalesce(sum(count_of_rooms), 0)::int as n from room_type where property_id = ${propertyId} and archived_at is null),
      bk as (select brd.date, count(*)::int as n, coalesce(sum(brd.amount_minor), 0)::bigint as amount
        from booking_room_day brd join booking_room br on br.id = brd.booking_room_id join booking b on b.id = br.booking_id
        where brd.property_id = ${propertyId} and b.status <> 'cancelled' and brd.date between ${from} and ${to} group by brd.date),
      bl as (select d.date, count(*)::int as n from unit_block ub join d on d.date >= ub.date_from and d.date < ub.date_to
        where ub.property_id = ${propertyId} and ub.cancelled_at is null and ub.reduces_availability group by d.date),
      rd as (select date, (values->>'rate')::bigint as rate, (values->>'minStay')::int as min_stay, coalesce((values->>'stopSell')::boolean, false) as closed
        from rate_day where rate_plan_id = ${plan?.id ?? null} and date between ${from} and ${to})
      select d.date::text as date, greatest(rooms.n - coalesce(bl.n, 0), 0) as sellable, coalesce(bk.n, 0) as booked, coalesce(bk.amount, 0) as amount,
        rd.rate, rd.min_stay, rd.closed
      from d cross join rooms left join bk on bk.date = d.date left join bl on bl.date = d.date left join rd on rd.date = d.date
      order by d.date`,
  );
  const blocked = await rawRows<{ reason: string; nights: number }>(
    tx,
    sql`select reason, sum(least(date_to, ${to}::date + 1) - greatest(date_from, ${from}::date))::int as nights
      from unit_block where property_id = ${propertyId} and cancelled_at is null and date_to > ${from} and date_from <= ${to}
      group by reason order by 2 desc`,
  );
  let revenueMinor = 0;
  const nights: YearNight[] = rows.map((r) => {
    revenueMinor += Number(r.amount);
    return {
      date: r.date,
      sellable: r.sellable,
      booked: r.booked,
      ...(r.rate === null ? {} : { rateMinor: Number(r.rate) }),
      ...(r.min_stay === null ? {} : { minStay: r.min_stay }),
      ...(r.closed ? { closed: true } : {}),
    };
  });
  return { nights, revenueMinor, blocked, ratePlanTitle: plan?.title ?? null };
}
