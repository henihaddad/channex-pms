import { sql } from "drizzle-orm";
import {
  channelKey,
  parsePricingDefaults,
  type PriceRounding,
  type PricingDefaults,
  type RestrictionValues,
  type SyncState,
} from "@pms/core";
import { rawRows, type Tx } from "../tenant.js";

/** Compact wire format for the grid (CAL-7): one array per cell. */
export type RateCellWire = [
  date: string,
  values: RestrictionValues,
  state: SyncState,
  version: number,
];
export type AvailCellWire = [date: string, available: number, state: SyncState, version: number];

export interface GridRatePlan {
  id: string;
  title: string;
  parentRatePlanId: string | null;
  cells: RateCellWire[];
}
export interface GridRoomType {
  id: string;
  title: string;
  countOfRooms: number;
  isSystemManaged: boolean;
  cells: AvailCellWire[];
  ratePlans: GridRatePlan[];
}
export interface GridProperty {
  id: string;
  title: string;
  kind: string;
  currency: string;
  state: string;
  groups: string[];
  /** The listing's main photo (its own library first, else the content an import kept). */
  photoUrl: string | null;
  /** The address's city, for the row's subtitle. */
  city: string | null;
  /** Channels with an active connection (`airbnb`, `booking_com`...), so a night can say what each guest sees. */
  channels: string[];
  /** Per-channel markup and rounding (spec 06 §6.6). */
  pricing: { markupBps: PricingDefaults["markupBps"]; rounding: PriceRounding };
  /** Private notes on nights in the range, keyed `${ratePlanId}|${date}`. */
  notes: Record<string, string>;
  roomTypes: GridRoomType[];
}

export interface GridQuery {
  dateFrom: string;
  dateTo: string;
  propertyIds?: string[];
  groupId?: string;
}

/**
 * Portfolio grid loader: three queries regardless of portfolio size, assembled
 * in memory. Row order is stable (title, id) so the client can key on it.
 */
export async function loadGrid(tx: Tx, q: GridQuery): Promise<GridProperty[]> {
  const filter = q.propertyIds?.length
    ? sql`and p.id in (${sql.join(
        q.propertyIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : q.groupId
      ? sql`and exists (select 1 from property_group_membership m where m.property_id = p.id and m.group_id = ${q.groupId})`
      : sql``;
  const props = await rawRows<{
    id: string;
    title: string;
    kind: string;
    currency: string;
    state: string;
    groups: string[] | null;
    photo_url: string | null;
    city: string | null;
    pricing: unknown;
    notes: Record<string, string> | null;
    channels: string[] | null;
  }>(
    tx,
    sql`select p.id, p.title, p.kind, p.currency, p.state,
      nullif(p.address->>'city', '') as city, p.settings->'pricing' as pricing,
      (select jsonb_object_agg(n.key, n.value) from jsonb_each_text(coalesce(p.settings->'nightNotes', '{}'::jsonb)) n
        where split_part(n.key, '|', 2) between ${q.dateFrom} and ${q.dateTo}) as notes,
      (select array_agg(distinct c.adapter_code) from channel_connection c where c.property_id = p.id and c.archived_at is null and c.is_active) as channels,
      (select array_agg(g.name order by g.name) from property_group g join property_group_membership m on m.group_id = g.id where m.property_id = p.id) as groups,
      coalesce(
        (select ph.storage_key from photo ph where ph.property_id = p.id order by ph.position, ph.id limit 1),
        p.settings #>> '{content,photos,0}'
      ) as photo_url
      from property p where p.archived_at is null and p.state <> 'archived' ${filter} order by p.title, p.id`,
  );
  if (props.length === 0) return [];
  const ids = sql.join(
    props.map((p) => sql`${p.id}`),
    sql`, `,
  );
  const rts = await rawRows<{
    id: string;
    property_id: string;
    title: string;
    count_of_rooms: number;
    is_system_managed: boolean;
  }>(
    tx,
    sql`select id, property_id, title, count_of_rooms, is_system_managed from room_type where property_id in (${ids}) and archived_at is null order by title, id`,
  );
  const rps = await rawRows<{
    id: string;
    room_type_id: string;
    title: string;
    parent_rate_plan_id: string | null;
  }>(
    tx,
    sql`select id, room_type_id, title, parent_rate_plan_id from rate_plan where property_id in (${ids}) and archived_at is null order by (parent_rate_plan_id is not null), title, id`,
  );
  const rateCells = await rawRows<{
    rate_plan_id: string;
    date: string;
    values: RestrictionValues;
    sync_state: SyncState;
    version: number;
  }>(
    tx,
    sql`select rate_plan_id, date::text, values, sync_state, version from rate_day where property_id in (${ids}) and date between ${q.dateFrom} and ${q.dateTo} order by rate_plan_id, date`,
  );
  const availCells = await rawRows<{
    room_type_id: string;
    date: string;
    available: number;
    sync_state: SyncState;
    version: number;
  }>(
    tx,
    sql`select room_type_id, date::text, available, sync_state, version from availability_day where property_id in (${ids}) and date between ${q.dateFrom} and ${q.dateTo} order by room_type_id, date`,
  );
  const rateByPlan = new Map<string, RateCellWire[]>();
  for (const c of rateCells)
    rateByPlan.set(c.rate_plan_id, [
      ...(rateByPlan.get(c.rate_plan_id) ?? []),
      [c.date, c.values, c.sync_state, c.version],
    ]);
  const availByRt = new Map<string, AvailCellWire[]>();
  for (const c of availCells)
    availByRt.set(c.room_type_id, [
      ...(availByRt.get(c.room_type_id) ?? []),
      [c.date, c.available, c.sync_state, c.version],
    ]);
  const plansByRt = new Map<string, GridRatePlan[]>();
  for (const r of rps)
    plansByRt.set(r.room_type_id, [
      ...(plansByRt.get(r.room_type_id) ?? []),
      {
        id: r.id,
        title: r.title,
        parentRatePlanId: r.parent_rate_plan_id,
        cells: rateByPlan.get(r.id) ?? [],
      },
    ]);
  const rtByProp = new Map<string, GridRoomType[]>();
  for (const r of rts)
    rtByProp.set(r.property_id, [
      ...(rtByProp.get(r.property_id) ?? []),
      {
        id: r.id,
        title: r.title,
        countOfRooms: r.count_of_rooms,
        isSystemManaged: r.is_system_managed,
        cells: availByRt.get(r.id) ?? [],
        ratePlans: plansByRt.get(r.id) ?? [],
      },
    ]);
  return props.map((p) => ({
    id: p.id,
    title: p.title,
    kind: p.kind,
    currency: p.currency,
    state: p.state,
    groups: p.groups ?? [],
    photoUrl: p.photo_url,
    city: p.city,
    channels: [...new Set((p.channels ?? []).map((c) => channelKey(c)))].sort(),
    pricing: (({ markupBps, rounding }) => ({ markupBps, rounding }))(
      parsePricingDefaults(p.pricing),
    ),
    notes: p.notes ?? {},
    roomTypes: rtByProp.get(p.id) ?? [],
  }));
}

/** A stay drawn as a bar across its nights (CAL-2a), and a block drawn as hatched nights. */
export interface GridStay {
  bookingId: string;
  propertyId: string;
  roomTypeId: string | null;
  /** First night. */
  from: string;
  /** Departure: the night before it is the last one (half-open, rule 5). */
  to: string;
  guest: string;
  otaName: string | null;
}
export interface GridBlock {
  propertyId: string;
  roomTypeId: string;
  from: string;
  /** Exclusive. */
  to: string;
  reason: string;
}

/**
 * The bookings and unit blocks that overlap a range, for the bars on the calendar. Names
 * come from the room's guest list (what the channel sent), the same source the room rack
 * and the arrivals board read under `booking:read`.
 */
export async function loadStays(
  tx: Tx,
  q: { dateFrom: string; dateTo: string; propertyIds: readonly string[] },
): Promise<{ stays: GridStay[]; blocks: GridBlock[] }> {
  if (q.propertyIds.length === 0) return { stays: [], blocks: [] };
  const ids = sql.join(
    q.propertyIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const stays = await rawRows<GridStay>(
    tx,
    sql`select b.id as "bookingId", b.property_id as "propertyId", br.room_type_id as "roomTypeId",
        br.checkin_date::text as "from", br.checkout_date::text as "to", b.ota_name as "otaName",
        trim(coalesce(br.guest_names->0->>'name', '') || ' ' || coalesce(br.guest_names->0->>'surname', '')) as guest
      from booking_room br join booking b on b.id = br.booking_id
      where b.property_id in (${ids}) and b.status <> 'cancelled'
        and br.checkout_date > ${q.dateFrom} and br.checkin_date <= ${q.dateTo}
      order by br.checkin_date, b.id`,
  );
  const blocks = await rawRows<GridBlock>(
    tx,
    sql`select property_id as "propertyId", room_type_id as "roomTypeId", date_from::text as "from", date_to::text as "to", reason
      from unit_block where property_id in (${ids}) and cancelled_at is null
        and date_to > ${q.dateFrom} and date_from <= ${q.dateTo}
      order by date_from`,
  );
  return { stays, blocks };
}

/**
 * Private notes on nights: what a manager wants the team to know about a date ("owner's
 * cousin may ask"). Kept with the property, keyed by plan and night; an empty body removes
 * the note. One statement, so two people noting different nights never lose each other's.
 */
export async function saveNightNotes(
  tx: Tx,
  propertyId: string,
  notes: ReadonlyArray<{ ratePlanId: string; date: string; body: string }>,
): Promise<void> {
  if (notes.length === 0) return;
  const set: Record<string, string> = {};
  const drop: string[] = [];
  for (const n of notes) {
    const key = `${n.ratePlanId}|${n.date}`;
    if (n.body.trim()) set[key] = n.body.trim().slice(0, 500);
    else drop.push(key);
  }
  const dropKeys = drop.length
    ? sql`array[${sql.join(
        drop.map((d) => sql`${d}`),
        sql`, `,
      )}]::text[]`
    : sql`'{}'::text[]`;
  await tx.execute(sql`update property set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{nightNotes}',
      (coalesce(settings->'nightNotes', '{}'::jsonb) || ${JSON.stringify(set)}::jsonb) - ${dropKeys}), updated_at = now()
    where id = ${propertyId}`);
}

export interface CellEdit {
  ratePlanId: string;
  date: string;
  values: RestrictionValues;
  expectedVersion?: number;
}

export type CellEditOutcome =
  | { ok: true; ratePlanId: string; date: string; version: number }
  | {
      ok: false;
      ratePlanId: string;
      date: string;
      reason: "conflict" | "missing";
      current?: { values: RestrictionValues; version: number; updatedBy: string | null };
    };

/**
 * CAL-5: an edit carrying `expectedVersion` fails with both values when the
 * cell moved since load. Never a silent last-write-wins.
 */
export async function checkCellVersions(
  tx: Tx,
  edits: readonly CellEdit[],
): Promise<CellEditOutcome[]> {
  const out: CellEditOutcome[] = [];
  for (const e of edits) {
    const [row] = await rawRows<{
      values: RestrictionValues;
      version: number;
      updated_by: string | null;
    }>(
      tx,
      sql`select values, version, updated_by from rate_day where rate_plan_id = ${e.ratePlanId} and date = ${e.date}`,
    );
    if (!row) {
      out.push({ ok: false, ratePlanId: e.ratePlanId, date: e.date, reason: "missing" });
      continue;
    }
    if (e.expectedVersion !== undefined && row.version !== e.expectedVersion) {
      out.push({
        ok: false,
        ratePlanId: e.ratePlanId,
        date: e.date,
        reason: "conflict",
        current: { values: row.values, version: row.version, updatedBy: row.updated_by },
      });
      continue;
    }
    out.push({ ok: true, ratePlanId: e.ratePlanId, date: e.date, version: row.version + 1 });
  }
  return out;
}

/** Cells whose sync state changed since a point in time, for the realtime channel (CAL-3). */
export async function cellStatesSince(
  tx: Tx,
  propertyIds: readonly string[],
  since: string,
): Promise<
  Array<{
    kind: "rate" | "availability";
    id: string;
    date: string;
    state: SyncState;
    version: number;
    value: unknown;
    updatedAt: string;
  }>
> {
  if (propertyIds.length === 0) return [];
  const ids = sql.join(
    propertyIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rate = await rawRows<{
    id: string;
    date: string;
    state: SyncState;
    version: number;
    value: unknown;
    updated_at: string;
  }>(
    tx,
    sql`select rate_plan_id as id, date::text, sync_state as state, version, values as value, greatest(updated_at, coalesce(synced_at, updated_at)) as updated_at
      from rate_day where property_id in (${ids}) and greatest(updated_at, coalesce(synced_at, updated_at)) > ${since} order by 6 limit 5000`,
  );
  const avail = await rawRows<{
    id: string;
    date: string;
    state: SyncState;
    version: number;
    value: unknown;
    updated_at: string;
  }>(
    tx,
    sql`select room_type_id as id, date::text, sync_state as state, version, available as value, greatest(updated_at, coalesce(synced_at, updated_at)) as updated_at
      from availability_day where property_id in (${ids}) and greatest(updated_at, coalesce(synced_at, updated_at)) > ${since} order by 6 limit 5000`,
  );
  return [
    ...rate.map((r) => ({
      kind: "rate" as const,
      id: r.id,
      date: r.date,
      state: r.state,
      version: r.version,
      value: r.value,
      updatedAt: r.updated_at,
    })),
    ...avail.map((r) => ({
      kind: "availability" as const,
      id: r.id,
      date: r.date,
      state: r.state,
      version: r.version,
      value: r.value,
      updatedAt: r.updated_at,
    })),
  ];
}

/** Median rate over the last 90 days for the BULK-4 guard rail. */
export async function medianRate(
  tx: Tx,
  propertyId: string,
  today: string,
): Promise<number | undefined> {
  const [r] = await rawRows<{ m: number | null }>(
    tx,
    sql`select percentile_cont(0.5) within group (order by (rd.values->>'rate')::numeric) as m from rate_day rd
      join rate_plan rp on rp.id = rd.rate_plan_id and rp.parent_rate_plan_id is null
      where rd.property_id = ${propertyId} and rd.date between ${today}::date - 90 and ${today}::date and rd.values ? 'rate'`,
  );
  return r?.m == null ? undefined : Number(r.m);
}

/** Room-type capacity change: availability follows for future dates (spec 06 §6.2, availability is derived). */
export async function applyCountChange(
  tx: Tx,
  roomTypeId: string,
  delta: number,
  from: string,
): Promise<number> {
  const res =
    await tx.execute(sql`update availability_day set available = greatest(0, available + ${delta}), sync_state = 'pending', version = version + 1, updated_at = now()
    where room_type_id = ${roomTypeId} and date >= ${from}`);
  return Number((res as { rowCount?: number }).rowCount ?? 0);
}
