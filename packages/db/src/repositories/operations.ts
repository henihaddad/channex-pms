import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  Id,
  maskCredential,
  planTurnovers,
  reconcileTasks,
  transitionTask,
  type CredentialType,
  type CredentialWindow,
  type ExistingTask,
  type PlannedTask,
  type Stay,
  type TaskState,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface TaskRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  timezone: string;
  unitId: string;
  unitName: string;
  date: string;
  type: string;
  windowFrom: string;
  windowTo: string;
  isSameDay: boolean;
  state: TaskState;
  assigneeId: string | null;
  assigneeName: string | null;
  crewId: string | null;
  sequence: number | null;
  departingBookingId: string | null;
  arrivingBookingId: string | null;
  arrivalTime: string | null;
  escalatedLevel: string | null;
  lastChange: string | null;
  progress: Array<{ key: string; done: boolean; photoRef?: string }>;
  photos: Array<{ ref: string; takenAt: string }>;
  notes: string | null;
  checklistId: string | null;
  address: Record<string, string>;
  lat: string | null;
  lng: string | null;
}

/** Turnover, crews, blocks, maintenance, notes and access credentials (spec 08 §8.4, §8.6–8.8). */
export class DrizzleOperationsRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  // ---- planning (OPS-1, OPS-3) ---------------------------------------------------

  /** Stays per unit for a property: assigned rooms, and the property's only unit for single_unit listings. */
  async staysForProperty(propertyId: string, from: string, to: string): Promise<Stay[]> {
    return rawRows<Stay>(
      this.tx,
      sql`select b.id as "bookingId", coalesce(br.assigned_unit_id, su.id) as "unitId", br.checkin_date::text as "arrivalDate", br.checkout_date::text as "checkoutDate", b.status
        from booking b join booking_room br on br.booking_id = b.id
        left join lateral (select u.id from unit u where u.property_id = b.property_id and u.is_system_managed and u.archived_at is null limit 1) su on true
        where b.property_id = ${propertyId} and br.checkout_date >= ${from} and br.checkin_date <= ${to} and coalesce(br.assigned_unit_id, su.id) is not null`,
    ).then((rows) =>
      rows.map((r) => ({
        ...r,
        departureDate: (r as unknown as { checkoutDate: string }).checkoutDate,
      })),
    );
  }

  async existingTasks(propertyId: string, from: string, to: string): Promise<ExistingTask[]> {
    const rows = await this.tx
      .select()
      .from(s.turnoverTask)
      .where(
        and(
          eq(s.turnoverTask.propertyId, propertyId),
          sql`${s.turnoverTask.date} between ${from} and ${to}`,
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      date: r.date,
      type: r.type as ExistingTask["type"],
      windowFrom: r.windowFrom,
      windowTo: r.windowTo,
      isSameDay: r.isSameDay,
      departingBookingId: r.departingBookingId,
      arrivingBookingId: r.arrivingBookingId,
      state: r.state as TaskState,
      assigneeId: r.assigneeId,
    }));
  }

  /** Plan and reconcile the property's tasks over a window; returns what changed for notifications. */
  async replan(
    propertyId: string,
    from: string,
    to: string,
    opts: Parameters<typeof planTurnovers>[1] = {},
  ): Promise<{
    created: number;
    cancelled: number;
    changed: Array<{ id: string; assigneeId: string | null; change: string }>;
  }> {
    const stays = await this.staysForProperty(propertyId, from, to);
    const planned = planTurnovers(stays, opts).filter((t) => t.date >= from && t.date <= to);
    const existing = await this.existingTasks(propertyId, from, to);
    const r = reconcileTasks(existing, planned);
    for (const t of r.create) await this.insertTask(propertyId, t);
    for (const t of r.cancel)
      await this.tx
        .update(s.turnoverTask)
        .set({
          state: "cancelled",
          cancelledAt: sql`now()`,
          lastChange: "booking changed: task no longer needed",
          updatedAt: sql`now()`,
        })
        .where(eq(s.turnoverTask.id, t.id));
    const changed: Array<{ id: string; assigneeId: string | null; change: string }> = [];
    for (const { task, next } of r.changed) {
      const change = `window ${task.windowFrom}-${task.windowTo} → ${next.windowFrom}-${next.windowTo}${next.isSameDay !== task.isSameDay ? (next.isSameDay ? "; now a same-day changeover" : "; no longer same-day") : ""}`;
      await this.tx
        .update(s.turnoverTask)
        .set({
          windowFrom: next.windowFrom,
          windowTo: next.windowTo,
          isSameDay: next.isSameDay,
          type: next.type,
          departingBookingId: next.departingBookingId,
          arrivingBookingId: next.arrivingBookingId,
          lastChange: change,
          updatedAt: sql`now()`,
        })
        .where(eq(s.turnoverTask.id, task.id));
      changed.push({ id: task.id, assigneeId: task.assigneeId, change });
    }
    return { created: r.create.length, cancelled: r.cancel.length, changed };
  }

  private async insertTask(propertyId: string, t: PlannedTask): Promise<void> {
    await this.tx
      .insert(s.turnoverTask)
      .values({
        id: Id.next(),
        orgId: this.orgId,
        propertyId,
        unitId: t.unitId,
        date: t.date,
        type: t.type,
        windowFrom: t.windowFrom,
        windowTo: t.windowTo,
        isSameDay: t.isSameDay,
        departingBookingId: t.departingBookingId,
        arrivingBookingId: t.arrivingBookingId,
      })
      .onConflictDoNothing();
  }

  // ---- board and cleaner reads ------------------------------------------------------

  private taskSelect() {
    return sql`select t.id, t.property_id as "propertyId", p.title as "propertyTitle", p.timezone, t.unit_id as "unitId", u.name as "unitName", t.date::text, t.type, t.window_from as "windowFrom", t.window_to as "windowTo",
      t.is_same_day as "isSameDay", t.state, t.assignee_id as "assigneeId", usr.name as "assigneeName", t.crew_id as "crewId", t.sequence, t.departing_booking_id as "departingBookingId", t.arriving_booking_id as "arrivingBookingId",
      (select coalesce(pol.check_in_time, '15:00') from policy pol where pol.property_id = t.property_id limit 1) as "arrivalTime",
      t.escalated_level as "escalatedLevel", t.last_change as "lastChange", t.progress, t.photos, t.notes, t.checklist_id as "checklistId", p.address, (u.attributes->>'lat') as lat, (u.attributes->>'lng') as lng
      from turnover_task t join property p on p.id = t.property_id join unit u on u.id = t.unit_id left join "user" usr on usr.id = t.assignee_id`;
  }
  async tasksOn(
    date: string,
    opts: { propertyId?: string; assigneeId?: string; includeCancelled?: boolean } = {},
  ): Promise<TaskRow[]> {
    return rawRows<TaskRow>(
      this.tx,
      sql`${this.taskSelect()} where t.date = ${date} ${opts.propertyId ? sql`and t.property_id = ${opts.propertyId}` : sql``} ${opts.assigneeId ? sql`and t.assignee_id = ${opts.assigneeId}` : sql``} ${opts.includeCancelled ? sql`` : sql`and t.state <> 'cancelled'`}
        order by t.is_same_day desc, t.window_to, t.sequence nulls last, t.id`,
    );
  }
  async tasksForBooking(bookingId: string): Promise<TaskRow[]> {
    return rawRows<TaskRow>(
      this.tx,
      sql`${this.taskSelect()} where (t.departing_booking_id = ${bookingId} or t.arriving_booking_id = ${bookingId}) and t.state <> 'cancelled' order by t.date`,
    );
  }
  async task(id: string): Promise<TaskRow | null> {
    const [r] = await rawRows<TaskRow>(this.tx, sql`${this.taskSelect()} where t.id = ${id}`);
    return r ?? null;
  }
  async openSameDayTasks(): Promise<
    Array<ExistingTask & { timezone: string; propertyId: string; escalatedLevel: string | null }>
  > {
    const rows = await rawRows<{
      id: string;
      unit_id: string;
      date: string;
      type: string;
      window_from: string;
      window_to: string;
      is_same_day: boolean;
      departing_booking_id: string | null;
      arriving_booking_id: string | null;
      state: string;
      assignee_id: string | null;
      timezone: string;
      property_id: string;
      escalated_level: string | null;
    }>(
      this.tx,
      sql`select t.id, t.unit_id, t.date::text, t.type, t.window_from, t.window_to, t.is_same_day, t.departing_booking_id, t.arriving_booking_id, t.state, t.assignee_id, p.timezone, t.property_id, t.escalated_level
        from turnover_task t join property p on p.id = t.property_id where t.is_same_day and t.assignee_id is null and t.state in ('planned','assigned') and t.date >= current_date - 1`,
    );
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      date: r.date,
      type: r.type as ExistingTask["type"],
      windowFrom: r.window_from,
      windowTo: r.window_to,
      isSameDay: r.is_same_day,
      departingBookingId: r.departing_booking_id,
      arrivingBookingId: r.arriving_booking_id,
      state: r.state as TaskState,
      assigneeId: r.assignee_id,
      timezone: r.timezone,
      propertyId: r.property_id,
      escalatedLevel: r.escalated_level,
    }));
  }
  async markEscalated(id: string, level: string): Promise<void> {
    await this.tx
      .update(s.turnoverTask)
      .set({ escalatedLevel: level, updatedAt: sql`now()` })
      .where(eq(s.turnoverTask.id, id));
  }

  // ---- assignment and state (OPS-2, spec 08 §8.7) -----------------------------------

  async assign(
    id: string,
    assigneeId: string | null,
    crewId: string | null,
    sequence?: number,
    travelMinutesEstimate?: number,
  ): Promise<void> {
    const [cur] = await this.tx
      .select({ state: s.turnoverTask.state })
      .from(s.turnoverTask)
      .where(eq(s.turnoverTask.id, id))
      .limit(1);
    if (!cur) throw new RangeError("task not found");
    const next = transitionTask(cur.state as TaskState, assigneeId ? "assigned" : "planned");
    if (!next.ok) throw next.error;
    await this.tx
      .update(s.turnoverTask)
      .set({
        assigneeId,
        crewId,
        state: next.value,
        sequence: sequence ?? null,
        travelMinutesEstimate: travelMinutesEstimate ?? null,
        escalatedLevel: null,
        updatedAt: sql`now()`,
      })
      .where(eq(s.turnoverTask.id, id));
  }
  async setState(
    id: string,
    to: TaskState,
    patch: Partial<{
      progress: TaskRow["progress"];
      photos: TaskRow["photos"];
      notes: string;
      durationActualMinutes: number;
    }> = {},
  ): Promise<TaskState> {
    const [cur] = await this.tx
      .select({ state: s.turnoverTask.state })
      .from(s.turnoverTask)
      .where(eq(s.turnoverTask.id, id))
      .limit(1);
    if (!cur) throw new RangeError("task not found");
    const next = transitionTask(cur.state as TaskState, to);
    if (!next.ok) throw next.error;
    const stamps: Record<string, unknown> = {
      accepted: { acceptedAt: sql`now()` },
      on_site: { startedAt: sql`now()` },
      done: { doneAt: sql`now()` },
      inspected: { inspectedAt: sql`now()` },
      cancelled: { cancelledAt: sql`now()` },
    };
    await this.tx
      .update(s.turnoverTask)
      .set({
        state: next.value,
        ...patch,
        ...((stamps[to] as object | undefined) ?? {}),
        updatedAt: sql`now()`,
      })
      .where(eq(s.turnoverTask.id, id));
    return next.value;
  }
  async saveProgress(
    id: string,
    progress: TaskRow["progress"],
    photos: TaskRow["photos"],
  ): Promise<void> {
    await this.tx
      .update(s.turnoverTask)
      .set({ progress, photos, updatedAt: sql`now()` })
      .where(eq(s.turnoverTask.id, id));
  }
  async setUnitStatus(unitId: string, status: string): Promise<void> {
    await this.tx.update(s.unit).set({ status }).where(eq(s.unit.id, unitId));
  }

  // ---- crews and checklists ---------------------------------------------------------

  async insertCrew(c: {
    id: string;
    name: string;
    serviceArea?: string;
    lat?: string;
    lng?: string;
  }): Promise<void> {
    await this.tx.insert(s.crew).values({
      id: c.id,
      orgId: this.orgId,
      name: c.name,
      serviceArea: c.serviceArea ?? null,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
    });
  }
  async addCrewMember(crewId: string, userId: string, role = "cleaner"): Promise<void> {
    await this.tx
      .insert(s.crewMember)
      .values({ orgId: this.orgId, crewId, userId, role })
      .onConflictDoNothing();
  }
  async listCrews(): Promise<
    Array<{
      id: string;
      name: string;
      serviceArea: string | null;
      lat: string | null;
      lng: string | null;
      members: Array<{ userId: string; name: string; role: string }>;
    }>
  > {
    const crews = await this.tx
      .select()
      .from(s.crew)
      .where(isNull(s.crew.archivedAt))
      .orderBy(asc(s.crew.name));
    const members = await rawRows<{ crew_id: string; user_id: string; name: string; role: string }>(
      this.tx,
      sql`select m.crew_id, m.user_id, u.name, m.role from crew_member m join "user" u on u.id = m.user_id`,
    );
    return crews.map((c) => ({
      id: c.id,
      name: c.name,
      serviceArea: c.serviceArea,
      lat: c.lat,
      lng: c.lng,
      members: members
        .filter((m) => m.crew_id === c.id)
        .map((m) => ({ userId: m.user_id, name: m.name, role: m.role })),
    }));
  }
  async insertChecklist(c: {
    id: string;
    name: string;
    taskType: string;
    items: Array<{ key: string; label: string; requiresPhoto: boolean }>;
  }): Promise<void> {
    await this.tx
      .insert(s.checklist)
      .values({ id: c.id, orgId: this.orgId, name: c.name, taskType: c.taskType, items: c.items });
  }
  async listChecklists(): Promise<
    Array<{
      id: string;
      name: string;
      taskType: string;
      items: Array<{ key: string; label: string; requiresPhoto: boolean }>;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.checklist)
      .where(isNull(s.checklist.archivedAt))
      .orderBy(asc(s.checklist.name));
    return rows.map((r) => ({ id: r.id, name: r.name, taskType: r.taskType, items: r.items }));
  }
  async checklistFor(taskType: string): Promise<{
    id: string;
    items: Array<{ key: string; label: string; requiresPhoto: boolean }>;
  } | null> {
    const [r] = await this.tx
      .select()
      .from(s.checklist)
      .where(and(eq(s.checklist.taskType, taskType), isNull(s.checklist.archivedAt)))
      .limit(1);
    return r ? { id: r.id, items: r.items } : null;
  }

  // ---- blocks (spec 08 §8.11 owner stays, §8.8 maintenance) ----------------------------

  async insertBlock(b: {
    id: string;
    propertyId: string;
    roomTypeId: string;
    unitId: string | null;
    dateFrom: string;
    dateTo: string;
    reason: string;
    reducesAvailability: boolean;
    note?: string;
    ownerId?: string;
    maintenanceIssueId?: string;
    createdBy?: string;
  }): Promise<void> {
    await this.tx.insert(s.unitBlock).values({
      id: b.id,
      orgId: this.orgId,
      propertyId: b.propertyId,
      roomTypeId: b.roomTypeId,
      unitId: b.unitId,
      dateFrom: b.dateFrom,
      dateTo: b.dateTo,
      reason: b.reason,
      reducesAvailability: b.reducesAvailability,
      note: b.note ?? null,
      ownerId: b.ownerId ?? null,
      maintenanceIssueId: b.maintenanceIssueId ?? null,
      createdBy: b.createdBy ?? null,
    });
  }
  async cancelBlock(
    id: string,
  ): Promise<{ propertyId: string; roomTypeId: string; dateFrom: string; dateTo: string } | null> {
    const [b] = await this.tx.select().from(s.unitBlock).where(eq(s.unitBlock.id, id)).limit(1);
    if (!b) return null;
    await this.tx
      .update(s.unitBlock)
      .set({ cancelledAt: sql`now()` })
      .where(eq(s.unitBlock.id, id));
    return {
      propertyId: b.propertyId,
      roomTypeId: b.roomTypeId,
      dateFrom: b.dateFrom,
      dateTo: b.dateTo,
    };
  }
  async listBlocks(propertyId?: string): Promise<
    Array<{
      id: string;
      propertyId: string;
      propertyTitle: string;
      roomTypeId: string;
      unitId: string | null;
      unitName: string | null;
      dateFrom: string;
      dateTo: string;
      reason: string;
      reducesAvailability: boolean;
      note: string | null;
    }>
  > {
    return rawRows(
      this.tx,
      sql`select b.id, b.property_id as "propertyId", p.title as "propertyTitle", b.room_type_id as "roomTypeId", b.unit_id as "unitId", u.name as "unitName", b.date_from::text as "dateFrom", b.date_to::text as "dateTo", b.reason, b.reduces_availability as "reducesAvailability", b.note
      from unit_block b join property p on p.id = b.property_id left join unit u on u.id = b.unit_id where b.cancelled_at is null ${propertyId ? sql`and b.property_id = ${propertyId}` : sql``} and b.date_to >= current_date - 30 order by b.date_from`,
    );
  }
  /** Blocking units per room type and date (for availability derivation, INV-2). */
  async blockedCount(
    propertyId: string,
    roomTypeId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Map<string, number>> {
    const rows = await rawRows<{ date: string; n: number }>(
      this.tx,
      sql`select d::date::text as date, count(*)::int as n from unit_block b, generate_series(greatest(b.date_from, ${dateFrom}::date), least(b.date_to - 1, ${dateTo}::date), '1 day') d
        where b.property_id = ${propertyId} and b.room_type_id = ${roomTypeId} and b.reduces_availability and b.cancelled_at is null and b.date_from <= ${dateTo} and b.date_to > ${dateFrom} group by 1`,
    );
    const ooo = await rawRows<{ n: number }>(
      this.tx,
      sql`select count(*)::int as n from unit where room_type_id = ${roomTypeId} and status = 'out_of_order' and archived_at is null`,
    );
    const out = new Map(rows.map((r) => [r.date, r.n]));
    const oooN = ooo[0]?.n ?? 0;
    if (oooN > 0)
      for (
        let d = new Date(`${dateFrom}T00:00:00Z`);
        d.toISOString().slice(0, 10) <= dateTo;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const k = d.toISOString().slice(0, 10);
        out.set(k, (out.get(k) ?? 0) + oooN);
      }
    return out;
  }

  // ---- maintenance (spec 08 §8.8) ------------------------------------------------------

  async insertIssue(i: {
    id: string;
    propertyId: string;
    unitId: string | null;
    taskId?: string;
    reportedBy?: string;
    reportedVia: string;
    severity: string;
    category: string;
    description: string;
    photos?: string[];
    blocksAvailability?: boolean;
  }): Promise<void> {
    await this.tx.insert(s.maintenanceIssue).values({
      id: i.id,
      orgId: this.orgId,
      propertyId: i.propertyId,
      unitId: i.unitId,
      taskId: i.taskId ?? null,
      reportedBy: i.reportedBy ?? null,
      reportedVia: i.reportedVia,
      severity: i.severity,
      category: i.category,
      description: i.description,
      photos: i.photos ?? [],
      blocksAvailability: i.blocksAvailability ?? false,
    });
  }
  async updateIssue(
    id: string,
    patch: Partial<{
      state: string;
      assigneeId: string | null;
      vendor: string | null;
      costMinor: number | null;
      rebillToOwner: boolean;
      ownerExpenseId: string | null;
      severity: string;
    }>,
  ): Promise<void> {
    await this.tx
      .update(s.maintenanceIssue)
      .set({ ...patch, ...(patch.state === "closed" ? { closedAt: sql`now()` } : {}) })
      .where(eq(s.maintenanceIssue.id, id));
  }
  async listIssues(
    opts: { propertyId?: string; open?: boolean; assigneeId?: string } = {},
  ): Promise<
    Array<{
      id: string;
      propertyId: string;
      propertyTitle: string;
      unitId: string | null;
      unitName: string | null;
      severity: string;
      category: string;
      description: string;
      state: string;
      blocksAvailability: boolean;
      assigneeId: string | null;
      vendor: string | null;
      costMinor: number | null;
      rebillToOwner: boolean;
      reportedVia: string;
      createdAt: string;
      photos: string[];
    }>
  > {
    return rawRows(
      this.tx,
      sql`select i.id, i.property_id as "propertyId", p.title as "propertyTitle", i.unit_id as "unitId", u.name as "unitName", i.severity, i.category, i.description, i.state, i.blocks_availability as "blocksAvailability", i.assignee_id as "assigneeId", i.vendor, i.cost_minor as "costMinor", i.rebill_to_owner as "rebillToOwner", i.reported_via as "reportedVia", i.created_at as "createdAt", i.photos
      from maintenance_issue i join property p on p.id = i.property_id left join unit u on u.id = i.unit_id
      where true ${opts.propertyId ? sql`and i.property_id = ${opts.propertyId}` : sql``} ${opts.open ? sql`and i.state <> 'closed'` : sql``} ${opts.assigneeId ? sql`and i.assignee_id = ${opts.assigneeId}` : sql``}
      order by case i.severity when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, i.created_at desc`,
    );
  }

  // ---- notes -------------------------------------------------------------------------

  async addNote(n: {
    subjectType: string;
    subjectId: string;
    body: string;
    authorId: string;
    pinned?: boolean;
  }): Promise<void> {
    await this.tx.insert(s.note).values({
      id: Id.next(),
      orgId: this.orgId,
      subjectType: n.subjectType,
      subjectId: n.subjectId,
      body: n.body,
      authorId: n.authorId,
      pinned: n.pinned ?? false,
    });
  }
  async notesFor(
    subjectType: string,
    subjectId: string,
  ): Promise<
    Array<{ id: string; body: string; pinned: boolean; authorId: string | null; createdAt: string }>
  > {
    const rows = await this.tx
      .select()
      .from(s.note)
      .where(and(eq(s.note.subjectType, subjectType), eq(s.note.subjectId, subjectId)))
      .orderBy(sql`${s.note.pinned} desc, ${s.note.createdAt} desc`);
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      pinned: r.pinned,
      authorId: r.authorId,
      createdAt: r.createdAt,
    }));
  }

  // ---- access credentials (INV-14, INV-7) ----------------------------------------------

  async activeCredentials(bookingId: string): Promise<
    Array<{
      id: string;
      unitId: string | null;
      type: CredentialType;
      providerRef: string | null;
      valueMasked: string;
      validFrom: string;
      validTo: string;
      deliveryState: string;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.accessCredential)
      .where(
        and(eq(s.accessCredential.bookingId, bookingId), isNull(s.accessCredential.revokedAt)),
      );
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      type: r.type as CredentialType,
      providerRef: r.providerRef,
      valueMasked: r.valueMasked,
      validFrom: r.validFrom,
      validTo: r.validTo,
      deliveryState: r.deliveryState,
    }));
  }
  async insertCredential(c: {
    id: string;
    propertyId: string;
    bookingId: string;
    unitId: string | null;
    type: CredentialType;
    valueEnc: string;
    value: string;
    window: CredentialWindow;
    providerRef: string | null;
    issuedBy: string;
  }): Promise<void> {
    // INV-7 / PCI-3: the scanner raises rather than writes; the sealed value is opaque to the database check
    if (/\d{13,19}/.test(c.value) || /\d{13,19}/.test(c.providerRef ?? ""))
      throw new RangeError("credential value looks like a card number (INV-7)");
    await this.tx.insert(s.accessCredential).values({
      id: c.id,
      orgId: this.orgId,
      propertyId: c.propertyId,
      bookingId: c.bookingId,
      unitId: c.unitId,
      type: c.type,
      valueEnc: c.valueEnc,
      valueMasked: maskCredential(c.value),
      validFrom: c.window.validFrom,
      validTo: c.window.validTo,
      providerRef: c.providerRef,
      issuedBy: c.issuedBy,
    });
  }
  async revokeCredential(id: string, reason: string): Promise<void> {
    await this.tx
      .update(s.accessCredential)
      .set({ revokedAt: sql`now()`, revokeReason: reason })
      .where(eq(s.accessCredential.id, id));
  }
  async credentialSecret(id: string): Promise<string | null> {
    const [r] = await this.tx
      .select({ v: s.accessCredential.valueEnc })
      .from(s.accessCredential)
      .where(eq(s.accessCredential.id, id))
      .limit(1);
    return r?.v ?? null;
  }
  /** Bookings with dates changed or cancelled since a moment, still holding an active credential (the INV-14 sweep). */
  async credentialsNeedingAction(): Promise<
    Array<{
      credentialId: string;
      bookingId: string;
      status: string;
      arrivalDate: string;
      departureDate: string;
      validFrom: string;
      validTo: string;
      propertyId: string;
      unitId: string | null;
      timezone: string;
      type: CredentialType;
    }>
  > {
    return rawRows(
      this.tx,
      sql`select c.id as "credentialId", c.booking_id as "bookingId", b.status, b.arrival_date::text as "arrivalDate", b.departure_date::text as "departureDate", c.valid_from as "validFrom", c.valid_to as "validTo", c.property_id as "propertyId", c.unit_id as "unitId", p.timezone, c.type
      from access_credential c join booking b on b.id = c.booking_id join property p on p.id = b.property_id where c.revoked_at is null`,
    );
  }
  async unitIds(propertyId: string): Promise<
    Array<{
      id: string;
      name: string;
      roomTypeId: string;
      status: string;
      attributes: Record<string, unknown>;
      access: Record<string, unknown>;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.unit)
      .where(and(eq(s.unit.propertyId, propertyId), isNull(s.unit.archivedAt)))
      .orderBy(asc(s.unit.name));
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      roomTypeId: u.roomTypeId,
      status: u.status,
      attributes: u.attributes as Record<string, unknown>,
      access: u.access as Record<string, unknown>,
    }));
  }
  async cancelTasksForBooking(bookingId: string): Promise<number> {
    const r = await this.tx
      .update(s.turnoverTask)
      .set({
        state: "cancelled",
        cancelledAt: sql`now()`,
        lastChange: "booking cancelled",
        updatedAt: sql`now()`,
      })
      .where(
        and(
          sql`(${s.turnoverTask.departingBookingId} = ${bookingId} or ${s.turnoverTask.arrivingBookingId} = ${bookingId})`,
          inArray(s.turnoverTask.state, ["planned", "assigned", "accepted"]),
        ),
      );
    return Number((r as { rowCount?: number }).rowCount ?? 0);
  }
}
