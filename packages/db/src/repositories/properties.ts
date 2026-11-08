import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  AUTOMATED_RATE_SOURCES,
  deriveCells,
  descendants,
  derivationChain,
  type DerivedOption,
  type Id,
  type PropertyRecord,
  type PropertyRepository,
  type PropertyTemplate,
  type ProvisioningState,
  type RateCell,
  type RatePlanRecord,
  type RestrictionValues,
  type RoomTypeRecord,
  type UnitRecord,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";
import { DrizzleAriStore } from "./ari.js";

export interface PropertySummary {
  id: string;
  title: string;
  kind: string;
  state: string;
  currency: string;
  timezone: string;
  channexPropertyId: string | null;
  roomTypes: number;
  ratePlans: number;
  units: number;
  provisioningStep: string | null;
  provisioningError: string | null;
  createdAt: string;
  /** First photo, from the property's own library or the content an import carried over. */
  photoUrl: string | null;
  city: string | null;
  /** ISO country code from the address, when known. */
  country: string | null;
  /** Adapter codes of the property's live connections, for the channel badges. */
  channels: string[];
}

export interface PropertyDetail {
  property: PropertyRecord & {
    address: Record<string, string>;
    channexPropertyId: string | null;
    webhookToken: string | null;
    /** Channex removes a property with no active channel; the date it warned about. */
    expectedRemovalDate: string | null;
  };
  roomTypes: Array<RoomTypeRecord & { channexRoomTypeId: string | null }>;
  units: UnitRecord[];
  ratePlans: Array<
    RatePlanRecord & { channexRatePlanId: string | null; derivedOption: DerivedOption | null }
  >;
  policies: Array<{ id: string; title: string; checkInTime: string; checkOutTime: string }>;
  provisioning: ProvisioningState | null;
  groups: Array<{ id: string; name: string }>;
}

/** The raw counts behind a property's occupancy, ADR, sync and content status (spec 03 §3.2a). */
export interface PropertyVitals {
  propertyId: string;
  /** Sellable units (sum of room type counts). */
  units: number;
  nightsSold: number;
  nightsAvailable: number;
  roomRevenueMinor: number;
  unmappedBookings: number;
  failedCells: number;
  pendingCells: number;
  /** When the channel manager last confirmed a calendar cell, or null if never. */
  lastSyncedAt: string | null;
  photos: number;
  pricingRailsSet: boolean;
  /** The direct booking site is switched on for this property. */
  directEnabled: boolean;
  guides: Array<{
    locale: string;
    published: boolean;
    sections: Array<{ kind: string; body?: string; fields?: Record<string, string> }>;
  }>;
}

/** The people and dates a property's overview shows beside its numbers. */
export interface PropertyOverviewExtras {
  nextArrival: {
    bookingId: string;
    date: string;
    channel: string | null;
    guestName: string | null;
  } | null;
  /** The owner on the agreement in force today, with its commercial model and payout terms. */
  owner: {
    id: string;
    name: string;
    model: Record<string, unknown>;
    payout: Record<string, unknown>;
  } | null;
  /** Who cleaned it most over the last 60 days, and how many turnovers. */
  cleaner: { name: string; tasks: number } | null;
  upcomingTurnovers: number;
  /** Photo URLs: the property's own library, else what an import carried over. */
  photos: string[];
}

/** Room types and rate plans across the portfolio, for the inventory tabs. */
export interface PortfolioInventory {
  roomTypes: Array<{
    id: string;
    propertyId: string;
    propertyTitle: string;
    propertyKind: string;
    title: string;
    countOfRooms: number;
    occAdults: number;
    occChildren: number;
    maxOccupancy: number;
    isSystemManaged: boolean;
    units: string[];
  }>;
  ratePlans: Array<{
    id: string;
    propertyId: string;
    propertyTitle: string;
    roomTypeId: string;
    roomTypeTitle: string;
    title: string;
    currency: string;
    parentTitle: string | null;
    derivedOption: DerivedOption | null;
    /** The rate on the requested date, in minor units, or null when no cell exists. */
    rateMinor: number | null;
    minStay: number | null;
    /** Adapter codes of the connections this plan is mapped on. */
    channels: string[];
  }>;
}

const CHUNK = 500;

/**
 * Properties, inventory shape and provisioning state. Implements the core
 * PropertyRepository port for creation and adds the reads the console needs.
 */
export class DrizzlePropertyRepository implements PropertyRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  // ---- creation (core port) --------------------------------------------------------

  async insertProperty(
    p: PropertyRecord & { address: Record<string, string>; settings: Record<string, unknown> },
  ): Promise<void> {
    await this.tx.insert(s.property).values({
      id: p.id,
      orgId: this.orgId,
      kind: p.kind,
      title: p.title,
      currency: p.currency,
      timezone: p.timezone,
      state: p.state,
      address: p.address,
      settings: p.settings,
    });
  }
  async addToGroups(propertyId: Id, groupIds: Id[]): Promise<void> {
    if (groupIds.length === 0) return;
    await this.tx
      .insert(s.propertyGroupMembership)
      .values(groupIds.map((groupId) => ({ orgId: this.orgId, groupId, propertyId })))
      .onConflictDoNothing();
  }
  async insertRoomType(rt: RoomTypeRecord): Promise<void> {
    await this.tx.insert(s.roomType).values({
      id: rt.id,
      orgId: this.orgId,
      propertyId: rt.propertyId,
      title: rt.title,
      countOfRooms: rt.countOfRooms,
      occAdults: rt.occAdults,
      occChildren: rt.occChildren,
      occInfants: rt.occInfants,
      maxOccupancy: rt.maxOccupancy,
      defaultOccupancy: rt.defaultOccupancy,
      isSystemManaged: rt.isSystemManaged,
    });
  }
  async insertUnit(u: UnitRecord): Promise<void> {
    await this.tx.insert(s.unit).values({
      id: u.id,
      orgId: this.orgId,
      propertyId: u.propertyId,
      roomTypeId: u.roomTypeId,
      name: u.name,
      isSystemManaged: u.isSystemManaged,
    });
  }
  async insertRatePlan(
    rp: RatePlanRecord & { derivedOption?: DerivedOption | null },
  ): Promise<void> {
    await this.tx.insert(s.ratePlan).values({
      id: rp.id,
      orgId: this.orgId,
      propertyId: rp.propertyId,
      roomTypeId: rp.roomTypeId,
      title: rp.title,
      currency: rp.currency,
      parentRatePlanId: rp.parentRatePlanId,
      derivedOption: rp.derivedOption ?? null,
    });
  }
  async seedRateCells(propertyId: Id, cells: RateCell[]): Promise<void> {
    for (let i = 0; i < cells.length; i += CHUNK) {
      const chunk = cells.slice(i, i + CHUNK);
      await this.tx
        .insert(s.rateDay)
        .values(
          chunk.map((c) => ({
            orgId: this.orgId,
            propertyId,
            ratePlanId: c.ratePlanId,
            date: c.date,
            values: c.values as Record<string, unknown>,
            source: "seed",
          })),
        )
        .onConflictDoNothing();
    }
  }
  async seedAvailability(
    propertyId: Id,
    roomTypeId: Id,
    from: string,
    days: number,
    available: number,
  ): Promise<void> {
    await this.tx.execute(sql`
      insert into availability_day (org_id, property_id, room_type_id, date, available, sync_state)
      select ${this.orgId}, ${propertyId}, ${roomTypeId}, d::date, ${available}, 'pending'
      from generate_series(${from}::date, ${from}::date + (${days - 1} || ' days')::interval, '1 day') as d
      on conflict do nothing`);
  }
  async setWebhookCredentials(propertyId: Id, token: string, secretSealed: string): Promise<void> {
    await this.tx
      .update(s.property)
      .set({ webhookToken: token, webhookSecretEnc: secretSealed })
      .where(eq(s.property.id, propertyId));
  }

  // ---- reads ---------------------------------------------------------------------

  async list(): Promise<PropertySummary[]> {
    return rawRows<PropertySummary>(
      this.tx,
      sql`select p.id, p.title, p.kind, p.state, p.currency, p.timezone, p.channex_property_id as "channexPropertyId",
        (select count(*)::int from room_type rt where rt.property_id = p.id and rt.archived_at is null) as "roomTypes",
        (select count(*)::int from rate_plan rp where rp.property_id = p.id and rp.archived_at is null) as "ratePlans",
        (select count(*)::int from unit u where u.property_id = p.id and u.archived_at is null) as "units",
        pv.step as "provisioningStep", pv.last_error as "provisioningError", p.created_at as "createdAt",
        coalesce(
          (select ph.storage_key from photo ph where ph.property_id = p.id order by ph.position, ph.id limit 1),
          p.settings #>> '{content,photos,0}'
        ) as "photoUrl",
        p.address ->> 'city' as city,
        p.address ->> 'country' as country,
        coalesce((select array_agg(distinct cc.adapter_code order by cc.adapter_code)
          from channel_connection cc
          where cc.property_id = p.id and cc.archived_at is null and cc.state in ('active','mapped','testing')), '{}') as channels
        from property p left join property_provisioning pv on pv.property_id = p.id
        where p.archived_at is null order by p.title, p.id`,
    );
  }

  /**
   * The counts behind the portfolio view (spec 03 §3.2a), one row per property: nights sold
   * and sellable and room revenue over [from, from + days), bookings waiting for a room,
   * calendar cells the channel manager refused, when the last cell was confirmed, and the
   * content a guest sees. Core turns these into occupancy, ADR and "needs attention".
   */
  async vitals(from: string, days: number, propertyId?: string): Promise<PropertyVitals[]> {
    const only = propertyId ? sql`and p.id = ${propertyId}` : sql``;
    const rows = await rawRows<{
      id: string;
      units: number;
      sold: number;
      revenue: number | string;
      unmapped: number;
      failed: number;
      pending: number;
      synced_at: string | null;
      photos: number;
      rails: boolean;
      direct: boolean;
    }>(
      this.tx,
      sql`select p.id,
        coalesce((select sum(rt.count_of_rooms) from room_type rt where rt.property_id = p.id and rt.archived_at is null), 0)::int as units,
        (select count(*) from booking_room_day d join booking_room br on br.id = d.booking_room_id join booking b on b.id = br.booking_id
           where d.property_id = p.id and d.status = 'confirmed' and b.status <> 'cancelled'
             and d.date >= ${from}::date and d.date < ${from}::date + ${days}::int)::int as sold,
        coalesce((select sum(d.amount_minor) from booking_room_day d join booking_room br on br.id = d.booking_room_id join booking b on b.id = br.booking_id
           where d.property_id = p.id and d.status = 'confirmed' and b.status <> 'cancelled'
             and d.date >= ${from}::date and d.date < ${from}::date + ${days}::int), 0) as revenue,
        (select count(*) from booking b where b.property_id = p.id and b.mapping_state <> 'mapped' and b.status <> 'cancelled')::int as unmapped,
        ((select count(*) from rate_day r where r.property_id = p.id and r.sync_state in ('failed','conflicted'))
          + (select count(*) from availability_day a where a.property_id = p.id and a.sync_state in ('failed','conflicted')))::int as failed,
        ((select count(*) from rate_day r where r.property_id = p.id and r.sync_state in ('pending','in_flight'))
          + (select count(*) from availability_day a where a.property_id = p.id and a.sync_state in ('pending','in_flight')))::int as pending,
        greatest((select max(r.synced_at) from rate_day r where r.property_id = p.id),
                 (select max(a.synced_at) from availability_day a where a.property_id = p.id))::text as synced_at,
        greatest((select count(*) from photo ph where ph.property_id = p.id),
                 coalesce(jsonb_array_length(case when jsonb_typeof(p.settings #> '{content,photos}') = 'array' then p.settings #> '{content,photos}' end), 0))::int as photos,
        exists(select 1 from rate_import_settings ri where ri.property_id = p.id and ri.floor_minor is not null and ri.ceiling_minor is not null) as rails,
        exists(select 1 from booking_engine_settings be where be.property_id = p.id and be.enabled) as direct
        from property p where p.archived_at is null ${only} order by p.title, p.id`,
    );
    const guides = await rawRows<{
      property_id: string;
      locale: string;
      published: boolean;
      sections: Array<{ kind: string; body?: string; fields?: Record<string, string> }>;
    }>(
      this.tx,
      sql`select g.property_id, g.locale, g.published, g.sections from property_guide g join property p on p.id = g.property_id
          where p.archived_at is null ${only}`,
    );
    return rows.map((r) => {
      const mine = guides.filter((g) => g.property_id === r.id);
      return {
        propertyId: r.id,
        units: r.units,
        nightsSold: r.sold,
        nightsAvailable: r.units * days,
        roomRevenueMinor: Number(r.revenue),
        unmappedBookings: r.unmapped,
        failedCells: r.failed,
        pendingCells: r.pending,
        lastSyncedAt: r.synced_at,
        photos: r.photos,
        pricingRailsSet: r.rails,
        directEnabled: r.direct,
        guides: mine.map((g) => ({
          locale: g.locale,
          published: g.published,
          sections: Array.isArray(g.sections) ? g.sections : [],
        })),
      };
    });
  }

  /**
   * Every room type and rate plan across the portfolio, with the rate and minimum stay on
   * `date`, for the "Rooms & units" and "Rate plans" tabs. One property when `propertyId`.
   */
  async inventory(date: string, propertyId?: string): Promise<PortfolioInventory> {
    const only = propertyId ? sql`and p.id = ${propertyId}` : sql``;
    const roomTypes = await rawRows<PortfolioInventory["roomTypes"][number]>(
      this.tx,
      sql`select rt.id, p.id as "propertyId", p.title as "propertyTitle", p.kind as "propertyKind", rt.title,
          rt.count_of_rooms as "countOfRooms", rt.occ_adults as "occAdults", rt.occ_children as "occChildren",
          rt.max_occupancy as "maxOccupancy", rt.is_system_managed as "isSystemManaged",
          coalesce((select array_agg(u.name order by u.name) from unit u where u.room_type_id = rt.id and u.archived_at is null), '{}') as units
          from room_type rt join property p on p.id = rt.property_id
          where rt.archived_at is null and p.archived_at is null ${only} order by p.title, rt.title`,
    );
    const ratePlans = await rawRows<PortfolioInventory["ratePlans"][number]>(
      this.tx,
      sql`select rp.id, p.id as "propertyId", p.title as "propertyTitle", rp.room_type_id as "roomTypeId", rt.title as "roomTypeTitle",
          rp.title, rp.currency, parent.title as "parentTitle", rp.derived_option as "derivedOption",
          (d.values ->> 'rate')::bigint as "rateMinor", (d.values ->> 'minStay')::int as "minStay",
          coalesce((select array_agg(distinct cc.adapter_code order by cc.adapter_code) from channel_mapping m
            join channel_connection cc on cc.id = m.connection_id
            where m.rate_plan_id = rp.id and cc.archived_at is null), '{}') as channels
          from rate_plan rp join property p on p.id = rp.property_id join room_type rt on rt.id = rp.room_type_id
          left join rate_plan parent on parent.id = rp.parent_rate_plan_id
          left join rate_day d on d.rate_plan_id = rp.id and d.date = ${date}::date
          where rp.archived_at is null and p.archived_at is null ${only}
          order by p.title, rt.title, rp.parent_rate_plan_id nulls first, rp.title`,
    );
    return {
      roomTypes,
      ratePlans: ratePlans.map((r) => ({
        ...r,
        rateMinor: r.rateMinor === null ? null : Number(r.rateMinor),
      })),
    };
  }

  /**
   * What the property's overview shows beside the numbers (spec 03 §3.2a): the next arrival,
   * the owner on the agreement in force, who cleans it, and its photos.
   */
  async overviewExtras(propertyId: string, today: string): Promise<PropertyOverviewExtras> {
    const [next] = await rawRows<{
      id: string;
      arrival_date: string;
      ota_name: string | null;
      names: Array<{ name?: string; surname?: string }> | null;
    }>(
      this.tx,
      sql`select b.id, b.arrival_date::text, b.ota_name,
          (select br.guest_names from booking_room br where br.booking_id = b.id order by br.id limit 1) as names
          from booking b where b.property_id = ${propertyId} and b.status <> 'cancelled' and b.arrival_date >= ${today}::date
          order by b.arrival_date, b.created_at limit 1`,
    );
    const [owner] = await rawRows<{
      id: string;
      name: string;
      model: Record<string, unknown>;
      payout: Record<string, unknown>;
    }>(
      this.tx,
      sql`select o.id, o.name, a.model, a.payout from owner_agreement a join owner o on o.id = a.owner_id
          where a.property_id = ${propertyId} and o.archived_at is null and a.effective_from <= ${today}::date
            and (a.effective_to is null or a.effective_to > ${today}::date)
          order by a.effective_from desc, a.version desc limit 1`,
    );
    const [cleaner] = await rawRows<{ name: string; tasks: number }>(
      this.tx,
      sql`select u.name, count(*)::int as tasks from turnover_task t join "user" u on u.id = t.assignee_id
          where t.property_id = ${propertyId} and t.date >= ${today}::date - 60
          group by u.name order by count(*) desc, u.name limit 1`,
    );
    const [upcoming] = await rawRows<{ n: number }>(
      this.tx,
      sql`select count(*)::int as n from turnover_task t
          where t.property_id = ${propertyId} and t.date >= ${today}::date and t.date < ${today}::date + 30`,
    );
    const photos = await rawRows<{ url: string }>(
      this.tx,
      sql`select storage_key as url from photo where property_id = ${propertyId} order by position, id`,
    );
    const [content] = await rawRows<{ photos: unknown }>(
      this.tx,
      sql`select settings #> '{content,photos}' as photos from property where id = ${propertyId}`,
    );
    const imported = Array.isArray(content?.photos) ? content.photos.map(String) : [];
    const first = next?.names?.[0];
    return {
      nextArrival: next
        ? {
            bookingId: next.id,
            date: next.arrival_date,
            channel: next.ota_name,
            guestName: first ? [first.name, first.surname].filter(Boolean).join(" ") : null,
          }
        : null,
      owner: owner
        ? { id: owner.id, name: owner.name, model: owner.model, payout: owner.payout }
        : null,
      cleaner: cleaner ? { name: cleaner.name, tasks: cleaner.tasks } : null,
      upcomingTurnovers: upcoming?.n ?? 0,
      photos: photos.length > 0 ? photos.map((p) => p.url) : imported,
    };
  }

  /**
   * What an Airbnb import compares against (spec 07 CH-5): the property's name, place and
   * content, and its base plan's nights over [from, from + days).
   */
  async importSnapshot(
    propertyId: string,
    from: string,
    days: number,
  ): Promise<{
    title: string;
    kind: string;
    currency: string;
    address: Record<string, string>;
    content: Record<string, unknown>;
    ratePlanId: string | null;
    nights: Array<{ date: string; rate: number | null; minStay: number | null }>;
  } | null> {
    const [p] = await rawRows<{
      title: string;
      kind: string;
      currency: string;
      address: Record<string, string> | null;
      content: Record<string, unknown> | null;
      plan: string | null;
    }>(
      this.tx,
      sql`select p.title, p.kind, p.currency, p.address, p.settings -> 'content' as content,
          (select rp.id from rate_plan rp where rp.property_id = p.id and rp.archived_at is null and rp.parent_rate_plan_id is null
            order by rp.title, rp.id limit 1) as plan
          from property p where p.id = ${propertyId} and p.archived_at is null`,
    );
    if (!p) return null;
    const nights = p.plan
      ? await rawRows<{ date: string; rate: number | string | null; min_stay: number | null }>(
          this.tx,
          sql`select date::text, (values ->> 'rate')::bigint as rate, (values ->> 'minStay')::int as min_stay
              from rate_day where rate_plan_id = ${p.plan} and date >= ${from}::date and date < ${from}::date + ${days}::int
              order by date`,
        )
      : [];
    return {
      title: p.title,
      kind: p.kind,
      currency: p.currency,
      address: p.address ?? {},
      content: p.content ?? {},
      ratePlanId: p.plan,
      nights: nights.map((n) => ({
        date: n.date,
        rate: n.rate === null ? null : Number(n.rate),
        minStay: n.min_stay,
      })),
    };
  }

  /** The property's name and address, edited from its overview. Provider ids are untouched. */
  async updateDetails(
    propertyId: string,
    d: { title: string; address: Record<string, string> },
  ): Promise<void> {
    await this.tx.execute(
      sql`update property set title = ${d.title}, address = coalesce(address, '{}'::jsonb) || ${JSON.stringify(d.address)}::jsonb,
          updated_at = now() where id = ${propertyId}`,
    );
  }

  /** Check-in and check-out times on the property's first policy, creating "Standard" when there is none. */
  async setHouseTimes(
    propertyId: string,
    times: { checkInTime: string; checkOutTime: string },
    newId: () => string,
  ): Promise<void> {
    const [p] = await this.tx
      .select({ id: s.policy.id })
      .from(s.policy)
      .where(eq(s.policy.propertyId, propertyId))
      .orderBy(asc(s.policy.title))
      .limit(1);
    if (p)
      await this.tx
        .update(s.policy)
        .set({ checkInTime: times.checkInTime, checkOutTime: times.checkOutTime })
        .where(eq(s.policy.id, p.id));
    else
      await this.insertPolicy({
        id: newId(),
        propertyId,
        title: "Standard",
        ...times,
        cancellation: { type: "flexible" },
      });
  }

  /** The amenities a property lists (`settings.content.amenities`), as an Airbnb import carries them. */
  async amenities(): Promise<Array<{ id: string; title: string; amenities: string[] }>> {
    const rows = await rawRows<{ id: string; title: string; amenities: unknown }>(
      this.tx,
      sql`select p.id, p.title, p.settings #> '{content,amenities}' as amenities
          from property p where p.archived_at is null order by p.title, p.id`,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      amenities: Array.isArray(r.amenities) ? r.amenities.map(String) : [],
    }));
  }

  /** Replaces a property's content fields (`settings.content.<key>`), leaving the rest of its settings alone. */
  async setContent(propertyId: string, content: Record<string, unknown>): Promise<void> {
    await this.tx.execute(
      sql`update property set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{content}',
            coalesce(settings -> 'content', '{}'::jsonb) || ${JSON.stringify(content)}::jsonb, true),
          updated_at = now() where id = ${propertyId}`,
    );
  }

  async get(id: string): Promise<PropertyDetail | null> {
    const [p] = await this.tx
      .select()
      .from(s.property)
      .where(and(eq(s.property.id, id), isNull(s.property.archivedAt)))
      .limit(1);
    if (!p) return null;
    const roomTypes = await this.tx
      .select()
      .from(s.roomType)
      .where(and(eq(s.roomType.propertyId, id), isNull(s.roomType.archivedAt)))
      .orderBy(asc(s.roomType.title));
    const units = await this.tx
      .select()
      .from(s.unit)
      .where(and(eq(s.unit.propertyId, id), isNull(s.unit.archivedAt)))
      .orderBy(asc(s.unit.name));
    const ratePlans = await this.tx
      .select()
      .from(s.ratePlan)
      .where(and(eq(s.ratePlan.propertyId, id), isNull(s.ratePlan.archivedAt)))
      .orderBy(asc(s.ratePlan.title));
    const policies = await this.tx.select().from(s.policy).where(eq(s.policy.propertyId, id));
    const [pv] = await this.tx
      .select()
      .from(s.propertyProvisioning)
      .where(eq(s.propertyProvisioning.propertyId, id))
      .limit(1);
    const groups = await rawRows<{ id: string; name: string }>(
      this.tx,
      sql`select g.id, g.name from property_group g join property_group_membership m on m.group_id = g.id where m.property_id = ${id} order by g.name`,
    );
    return {
      property: {
        id: p.id as Id,
        orgId: p.orgId as Id,
        kind: p.kind as PropertyRecord["kind"],
        title: p.title,
        currency: p.currency,
        timezone: p.timezone,
        state: p.state as PropertyRecord["state"],
        address: p.address as Record<string, string>,
        channexPropertyId: p.channexPropertyId,
        webhookToken: p.webhookToken,
        expectedRemovalDate: p.expectedRemovalDate,
      },
      roomTypes: roomTypes.map((r) => ({
        id: r.id as Id,
        propertyId: r.propertyId as Id,
        title: r.title,
        countOfRooms: r.countOfRooms,
        occAdults: r.occAdults,
        occChildren: r.occChildren,
        occInfants: r.occInfants,
        maxOccupancy: r.maxOccupancy,
        defaultOccupancy: r.defaultOccupancy,
        isSystemManaged: r.isSystemManaged,
        channexRoomTypeId: r.channexRoomTypeId,
      })),
      units: units.map((u) => ({
        id: u.id as Id,
        propertyId: u.propertyId as Id,
        roomTypeId: u.roomTypeId as Id,
        name: u.name,
        isSystemManaged: u.isSystemManaged,
      })),
      ratePlans: ratePlans.map((r) => ({
        id: r.id as Id,
        propertyId: r.propertyId as Id,
        roomTypeId: r.roomTypeId as Id,
        title: r.title,
        currency: r.currency,
        parentRatePlanId: r.parentRatePlanId as Id | null,
        channexRatePlanId: r.channexRatePlanId,
        derivedOption: r.derivedOption ?? null,
      })),
      policies: policies.map((x) => ({
        id: x.id,
        title: x.title,
        checkInTime: x.checkInTime,
        checkOutTime: x.checkOutTime,
      })),
      provisioning: pv
        ? {
            step: pv.step as ProvisioningState["step"],
            refs: pv.refs,
            attempts: pv.attempts,
            lastError: pv.lastError,
          }
        : null,
      groups,
    };
  }

  async listGroups(): Promise<Array<{ id: string; name: string; kind: string }>> {
    return rawRows(this.tx, sql`select id, name, kind from property_group order by name`);
  }

  // ---- provisioning state (PROV-1, PROV-2) ------------------------------------------

  async loadProvisioning(propertyId: string): Promise<ProvisioningState | null> {
    const [pv] = await this.tx
      .select()
      .from(s.propertyProvisioning)
      .where(eq(s.propertyProvisioning.propertyId, propertyId))
      .limit(1);
    return pv
      ? {
          step: pv.step as ProvisioningState["step"],
          refs: pv.refs,
          attempts: pv.attempts,
          lastError: pv.lastError,
        }
      : null;
  }
  async saveProvisioning(propertyId: string, state: ProvisioningState): Promise<void> {
    await this.tx
      .insert(s.propertyProvisioning)
      .values({
        propertyId,
        orgId: this.orgId,
        step: state.step,
        refs: state.refs,
        attempts: state.attempts,
        lastError: state.lastError,
      })
      .onConflictDoUpdate({
        target: s.propertyProvisioning.propertyId,
        set: {
          step: state.step,
          refs: state.refs,
          attempts: state.attempts,
          lastError: state.lastError,
          updatedAt: sql`now()`,
        },
      });
  }
  async setPropertyState(propertyId: string, state: PropertyRecord["state"]): Promise<void> {
    await this.tx
      .update(s.property)
      .set({ state, updatedAt: sql`now()` })
      .where(eq(s.property.id, propertyId));
  }
  async setRemoteIds(input: {
    propertyId?: { local: string; remote: string };
    roomTypes?: Array<{ local: string; remote: string }>;
    ratePlans?: Array<{ local: string; remote: string }>;
  }): Promise<void> {
    if (input.propertyId)
      await this.tx
        .update(s.property)
        .set({ channexPropertyId: input.propertyId.remote })
        .where(eq(s.property.id, input.propertyId.local));
    for (const r of input.roomTypes ?? [])
      await this.tx
        .update(s.roomType)
        .set({ channexRoomTypeId: r.remote })
        .where(eq(s.roomType.id, r.local));
    for (const r of input.ratePlans ?? [])
      await this.tx
        .update(s.ratePlan)
        .set({ channexRatePlanId: r.remote })
        .where(eq(s.ratePlan.id, r.local));
  }
  /** Local ↔ provider ids for the translating provider decorator. */
  async idMap(propertyId: string): Promise<{
    property: { local: string; remote: string };
    roomTypes: Array<{ local: string; remote: string }>;
    ratePlans: Array<{ local: string; remote: string }>;
  }> {
    const [p] = await this.tx
      .select({ id: s.property.id, remote: s.property.channexPropertyId })
      .from(s.property)
      .where(eq(s.property.id, propertyId))
      .limit(1);
    const rts = await this.tx
      .select({ id: s.roomType.id, remote: s.roomType.channexRoomTypeId })
      .from(s.roomType)
      .where(eq(s.roomType.propertyId, propertyId));
    const rps = await this.tx
      .select({ id: s.ratePlan.id, remote: s.ratePlan.channexRatePlanId })
      .from(s.ratePlan)
      .where(eq(s.ratePlan.propertyId, propertyId));
    return {
      property: { local: propertyId, remote: p?.remote ?? propertyId },
      roomTypes: rts.filter((r) => r.remote).map((r) => ({ local: r.id, remote: r.remote! })),
      ratePlans: rps.filter((r) => r.remote).map((r) => ({ local: r.id, remote: r.remote! })),
    };
  }

  // ---- templates (spec 03 §3.2) -----------------------------------------------------

  async insertTemplate(t: PropertyTemplate & { createdBy?: string }): Promise<void> {
    await this.tx.insert(s.propertyTemplate).values({
      id: t.id,
      orgId: this.orgId,
      name: t.name,
      payload: t.payload,
      createdBy: t.createdBy ?? null,
    });
  }
  async listTemplates(): Promise<PropertyTemplate[]> {
    const rows = await this.tx
      .select()
      .from(s.propertyTemplate)
      .where(isNull(s.propertyTemplate.archivedAt))
      .orderBy(asc(s.propertyTemplate.name));
    return rows.map((r) => ({
      id: r.id as Id,
      name: r.name,
      payload: r.payload as PropertyTemplate["payload"],
    }));
  }
  async getTemplate(id: string): Promise<PropertyTemplate | null> {
    const [r] = await this.tx
      .select()
      .from(s.propertyTemplate)
      .where(eq(s.propertyTemplate.id, id))
      .limit(1);
    return r
      ? { id: r.id as Id, name: r.name, payload: r.payload as PropertyTemplate["payload"] }
      : null;
  }

  // ---- rate plans: derived (INV-6) ---------------------------------------------------

  async planGraph(propertyId: string): Promise<
    Map<
      string,
      {
        id: string;
        parentRatePlanId: string | null;
        derivedOption: DerivedOption | null;
        roomTypeId: string;
      }
    >
  > {
    const rows = await this.tx
      .select({
        id: s.ratePlan.id,
        parentRatePlanId: s.ratePlan.parentRatePlanId,
        derivedOption: s.ratePlan.derivedOption,
        roomTypeId: s.ratePlan.roomTypeId,
      })
      .from(s.ratePlan)
      .where(and(eq(s.ratePlan.propertyId, propertyId), isNull(s.ratePlan.archivedAt)));
    return new Map(rows.map((r) => [r.id, { ...r, derivedOption: r.derivedOption ?? null }]));
  }

  /** Create a derived plan and seed it from the parent's whole horizon (spec 06 §6.1). */
  async addDerivedRatePlan(input: {
    id: string;
    propertyId: string;
    parentRatePlanId: string;
    title: string;
    option: DerivedOption;
  }): Promise<number> {
    const graph = await this.planGraph(input.propertyId);
    const parent = graph.get(input.parentRatePlanId);
    if (!parent) throw new RangeError("parent rate plan not found in this property (INV-8)");
    graph.set(input.id, {
      id: input.id,
      parentRatePlanId: input.parentRatePlanId,
      derivedOption: input.option,
      roomTypeId: parent.roomTypeId,
    });
    derivationChain(input.id, graph); // throws on cycle / depth (INV-6)
    const [p] = await this.tx
      .select({ currency: s.property.currency })
      .from(s.property)
      .where(eq(s.property.id, input.propertyId))
      .limit(1);
    await this.insertRatePlan({
      id: input.id as Id,
      propertyId: input.propertyId as Id,
      roomTypeId: parent.roomTypeId as Id,
      title: input.title,
      currency: p?.currency ?? "EUR",
      parentRatePlanId: input.parentRatePlanId as Id,
      derivedOption: input.option,
    });
    const parentCells = await this.rateCells(input.parentRatePlanId);
    const cells = deriveCells(parentCells, input.id, input.option);
    await this.seedRateCells(input.propertyId as Id, cells);
    return cells.length;
  }

  async rateCells(ratePlanId: string, dateFrom?: string, dateTo?: string): Promise<RateCell[]> {
    const rows = await rawRows<{ date: string; values: RestrictionValues }>(
      this.tx,
      sql`select date::text, values from rate_day where rate_plan_id = ${ratePlanId}
        ${dateFrom ? sql`and date >= ${dateFrom}` : sql``} ${dateTo ? sql`and date <= ${dateTo}` : sql``} order by date`,
    );
    return rows.map((r) => ({ ratePlanId, date: r.date, values: r.values }));
  }

  /**
   * YR-5: when each cell was last written by a hand rather than by automation, keyed
   * `${ratePlanId}|${date}`. Anything that is not one of our own automated sources counts
   * as a human, so an unknown source holds the cell rather than losing someone's decision.
   */
  async manualEditedAt(
    ratePlanIds: readonly string[],
    from: string,
    to: string,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(ratePlanIds)];
    if (ids.length === 0) return new Map();
    const rows = await rawRows<{ rate_plan_id: string; date: string; updated_at: string }>(
      this.tx,
      sql`select rate_plan_id, date::text, updated_at::text
          from rate_day
          where date between ${from} and ${to}
            and source not in (${sql.join(
              AUTOMATED_RATE_SOURCES.map((x) => sql`${x}`),
              sql`, `,
            )})
            and rate_plan_id in (${sql.join(
              ids.map((i) => sql`${i}`),
              sql`, `,
            )})`,
    );
    return new Map(rows.map((r) => [`${r.rate_plan_id}|${r.date}`, r.updated_at]));
  }

  /**
   * Write rate cells and re-derive every descendant for the same dates in the
   * same transaction, so a parent edit never leaves a child stale (spec 06 §6.1).
   */
  async applyRateCells(
    propertyId: string,
    cells: readonly RateCell[],
    source: string,
    updatedBy?: string,
  ): Promise<{ written: number; derived: number }> {
    const store = new DrizzleAriStore(this.tx);
    const graph = await this.planGraph(propertyId);
    let derived = 0;
    for (const c of cells)
      await store.setRate(
        propertyId,
        this.orgId,
        c.ratePlanId,
        c.date,
        c.values,
        source,
        updatedBy,
      );
    const byPlan = new Map<string, RateCell[]>();
    for (const c of cells) byPlan.set(c.ratePlanId, [...(byPlan.get(c.ratePlanId) ?? []), c]);
    for (const [planId, planCells] of byPlan) {
      const dates = planCells.map((c) => c.date);
      const min = dates.reduce((a, b) => (a < b ? a : b));
      const max = dates.reduce((a, b) => (a > b ? a : b));
      for (const childId of descendants(planId, graph)) {
        const child = graph.get(childId)!;
        const parentCells = (await this.rateCells(child.parentRatePlanId!, min, max)).filter((c) =>
          dates.includes(c.date),
        );
        const childCells = child.derivedOption
          ? deriveCells(parentCells, childId, child.derivedOption)
          : [];
        for (const c of childCells)
          await store.setRate(
            propertyId,
            this.orgId,
            c.ratePlanId,
            c.date,
            c.values,
            "derived",
            updatedBy,
          );
        derived += childCells.length;
      }
    }
    return { written: cells.length, derived };
  }

  // ---- horizon (PROV-5, spec 06 §6.7) ----------------------------------------------

  async horizonEnds(): Promise<
    Array<{
      propertyId: string;
      ratePlanId: string;
      roomTypeId: string;
      timezone: string;
      lastDate: string;
    }>
  > {
    return rawRows(
      this.tx,
      sql`select rp.property_id as "propertyId", rp.id as "ratePlanId", rp.room_type_id as "roomTypeId", p.timezone,
        coalesce((select max(date)::text from rate_day rd where rd.rate_plan_id = rp.id), '1970-01-01') as "lastDate"
        from rate_plan rp join property p on p.id = rp.property_id
        where rp.archived_at is null and p.archived_at is null and p.state in ('syncing','live')`,
    );
  }
  async roomTypeCount(roomTypeId: string): Promise<number> {
    const [r] = await this.tx
      .select({ n: s.roomType.countOfRooms })
      .from(s.roomType)
      .where(eq(s.roomType.id, roomTypeId))
      .limit(1);
    return r?.n ?? 0;
  }

  // ---- policies -------------------------------------------------------------------

  async insertPolicy(p: {
    id: string;
    propertyId: string;
    title: string;
    checkInTime: string;
    checkOutTime: string;
    cancellation?: Record<string, unknown>;
  }): Promise<void> {
    await this.tx.insert(s.policy).values({
      id: p.id,
      orgId: this.orgId,
      propertyId: p.propertyId,
      title: p.title,
      checkInTime: p.checkInTime,
      checkOutTime: p.checkOutTime,
      cancellation: p.cancellation ?? {},
    });
  }

  // ---- bulk operations (BULK-2) ---------------------------------------------------

  async insertBulkOperation(b: {
    id: string;
    propertyId: string;
    input: unknown;
    cellCount: number;
    inverse: RateCell[];
    createdBy?: string;
  }): Promise<void> {
    await this.tx.insert(s.bulkOperation).values({
      id: b.id,
      orgId: this.orgId,
      propertyId: b.propertyId,
      input: b.input,
      cellCount: b.cellCount,
      inverse: b.inverse,
      createdBy: b.createdBy ?? null,
    });
  }
  async getBulkOperation(id: string): Promise<{
    id: string;
    propertyId: string;
    input: unknown;
    cellCount: number;
    inverse: RateCell[];
    state: string;
    createdAt: string;
  } | null> {
    const [r] = await this.tx
      .select()
      .from(s.bulkOperation)
      .where(eq(s.bulkOperation.id, id))
      .limit(1);
    return r
      ? {
          id: r.id,
          propertyId: r.propertyId,
          input: r.input,
          cellCount: r.cellCount,
          inverse: r.inverse as RateCell[],
          state: r.state,
          createdAt: r.createdAt,
        }
      : null;
  }
  async markBulkUndone(id: string): Promise<void> {
    await this.tx
      .update(s.bulkOperation)
      .set({ state: "undone", undoneAt: sql`now()` })
      .where(eq(s.bulkOperation.id, id));
  }
  async listBulkOperations(
    propertyId: string,
    limit = 20,
  ): Promise<
    Array<{ id: string; cellCount: number; state: string; createdAt: string; input: unknown }>
  > {
    const rows = await this.tx
      .select()
      .from(s.bulkOperation)
      .where(eq(s.bulkOperation.propertyId, propertyId))
      .orderBy(sql`${s.bulkOperation.createdAt} desc`)
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      cellCount: r.cellCount,
      state: r.state,
      createdAt: r.createdAt,
      input: r.input,
    }));
  }
}
