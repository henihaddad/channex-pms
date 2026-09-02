import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
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
}

export interface PropertyDetail {
  property: PropertyRecord & {
    address: Record<string, string>;
    channexPropertyId: string | null;
    webhookToken: string | null;
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
        pv.step as "provisioningStep", pv.last_error as "provisioningError", p.created_at as "createdAt"
        from property p left join property_provisioning pv on pv.property_id = p.id
        where p.archived_at is null order by p.title, p.id`,
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
