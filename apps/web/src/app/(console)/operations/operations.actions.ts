"use server";

import { revalidatePath } from "next/cache";
import { dueEscalations, Id, suggestRoute, type TaskState } from "@pms/core";
import {
  DrizzleOperationsRepository,
  DrizzleReservationRepository,
  rawRows,
  sql,
  type TaskRow,
} from "@pms/db";
import { recomputeAvailability } from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { myDay, updateTask, type MyDay, type TaskUpdate } from "@/server/ops";

export interface Board {
  date: string;
  tasks: TaskRow[];
  departures: Array<{
    bookingId: string;
    propertyTitle: string;
    unitName: string | null;
    guest: string;
    checkOutTime: string;
  }>;
  arrivals: Array<{
    bookingId: string;
    propertyTitle: string;
    unitName: string | null;
    guest: string;
    checkInTime: string;
    credentials: number;
    unitStatus: string | null;
  }>;
  escalations: Array<{ taskId: string; level: string; minutesLeft: number }>;
  crews: Awaited<ReturnType<DrizzleOperationsRepository["listCrews"]>>;
}

/** The turnover board (spec 08 §8.6): departures, turnovers with countdowns, arrivals, one day at a time. */
export const loadBoard = withPermission<[string], Board>(
  "turnover:read",
  { scope: "organization", audit: false },
  async (ctx, date) => {
    const c = await container();
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const tasks = await ops.tasksOn(date);
    const departures = await rawRows<Board["departures"][number]>(
      ctx.tx,
      sql`select b.id as "bookingId", p.title as "propertyTitle", u.name as "unitName", coalesce(br.guest_names->0->>'surname', '') as guest, coalesce((select check_out_time from policy where property_id = p.id limit 1), '10:00') as "checkOutTime"
    from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id left join unit u on u.id = br.assigned_unit_id where b.departure_date = ${date} and b.status <> 'cancelled' order by p.title`,
    );
    const arrivals = await rawRows<Board["arrivals"][number]>(
      ctx.tx,
      sql`select b.id as "bookingId", p.title as "propertyTitle", u.name as "unitName", coalesce(br.guest_names->0->>'surname', '') as guest, coalesce((select check_in_time from policy where property_id = p.id limit 1), '15:00') as "checkInTime",
    (select count(*)::int from access_credential ac where ac.booking_id = b.id and ac.revoked_at is null) as credentials, coalesce(u.status, su.status) as "unitStatus"
    from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id left join unit u on u.id = br.assigned_unit_id left join lateral (select status from unit where property_id = p.id and is_system_managed limit 1) su on true where b.arrival_date = ${date} and b.status <> 'cancelled' order by p.title`,
    );
    const open = await ops.openSameDayTasks();
    const escalations = dueEscalations(open, c.clock.now().toString()).map((e) => ({
      taskId: e.task.id,
      level: e.level,
      minutesLeft: e.minutesLeft,
    }));
    return { date, tasks, departures, arrivals, escalations, crews: await ops.listCrews() };
  },
);

export const assignTaskAction = withPermission<[FormData], void>(
  "turnover:assign",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "turnover_task", id: String(fd.get("taskId")) }),
  },
  async (ctx, fd) => {
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).assign(
      String(fd.get("taskId")),
      String(fd.get("assigneeId") || "") || null,
      String(fd.get("crewId") || "") || null,
    );
    revalidatePath("/operations");
  },
);

/** OPS-2: greedy routing for the day's open tasks over the crews' members; applied as sequences with travel estimates. */
export const suggestRouteAction = withPermission<[FormData], void>(
  "turnover:assign",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "turnover_board", id: String(fd.get("date")) }),
  },
  async (ctx, fd) => {
    const date = String(fd.get("date"));
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const tasks = (await ops.tasksOn(date)).filter(
      (t) => t.state === "planned" || t.state === "assigned",
    );
    const crews = await ops.listCrews();
    const workers = crews.flatMap((cr) =>
      cr.members.map((m) => ({
        id: m.userId,
        lat: Number(cr.lat ?? 38.72),
        lng: Number(cr.lng ?? -9.14),
        startsAt: `${date}T08:00:00Z`,
        capacityMinutes: 480,
      })),
    );
    if (workers.length === 0)
      throw new HttpProblem(422, "no_crews", "Add a crew with members before routing");
    const points = tasks.map((t) => ({
      id: t.id,
      lat: Number(t.lat ?? 38.72),
      lng: Number(t.lng ?? -9.14),
      deadline: `${t.date}T${t.windowTo}:00Z`,
      durationMinutes: t.type === "changeover" ? 120 : 90,
    }));
    const plan = suggestRoute(points, workers);
    for (const p of plan.plans)
      for (const s of p.stops)
        await ops.assign(
          s.taskId,
          p.workerId,
          crews.find((cr) => cr.members.some((m) => m.userId === p.workerId))?.id ?? null,
          s.sequence,
          s.travelMinutesEstimate,
        );
    revalidatePath("/operations");
  },
);

export const taskStateAction = withPermission<[FormData], void>(
  "turnover:update",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "turnover_task", id: String(fd.get("taskId")) }),
  },
  async (ctx, fd) => {
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).setState(
      String(fd.get("taskId")),
      String(fd.get("state")) as TaskState,
    );
    revalidatePath("/operations");
  },
);

export const createCrewAction = withPermission<[FormData], void>(
  "turnover:assign",
  { scope: "organization", subject: (fd) => ({ kind: "crew", id: String(fd.get("name")) }) },
  async (ctx, fd) => {
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).insertCrew({
      id: Id.next(),
      name: String(fd.get("name")),
      serviceArea: String(fd.get("serviceArea") || "") || undefined,
      lat: String(fd.get("lat") || "") || undefined,
      lng: String(fd.get("lng") || "") || undefined,
    });
    revalidatePath("/operations/crews");
  },
);

export const addCrewMemberAction = withPermission<[FormData], void>(
  "turnover:assign",
  { scope: "organization", subject: (fd) => ({ kind: "crew", id: String(fd.get("crewId")) }) },
  async (ctx, fd) => {
    const email = String(fd.get("email")).toLowerCase();
    const [u] = await rawRows<{ id: string }>(
      ctx.tx,
      sql`select u.id from "user" u join org_membership m on m.user_id = u.id where lower(u.email) = ${email} and m.org_id = ${ctx.orgId}`,
    );
    if (!u)
      throw new HttpProblem(
        404,
        "not_member",
        "Invite this person to the organization first (cleaner role)",
      );
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).addCrewMember(
      String(fd.get("crewId")),
      u.id,
      String(fd.get("role") || "cleaner"),
    );
    revalidatePath("/operations/crews");
  },
);

export const createChecklistAction = withPermission<[FormData], void>(
  "checklist:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "checklist", id: String(fd.get("checklistName")) }),
  },
  async (ctx, fd) => {
    const items = String(fd.get("items") || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({
        key: l
          .replace(/\*$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_"),
        label: l.replace(/\*$/, ""),
        requiresPhoto: l.endsWith("*"),
      }));
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).insertChecklist({
      id: Id.next(),
      name: String(fd.get("checklistName")),
      taskType: String(fd.get("taskType") || "changeover"),
      items,
    });
    revalidatePath("/operations/crews");
  },
);

export const loadCrewsAndChecklists = withPermission<
  [],
  {
    crews: Awaited<ReturnType<DrizzleOperationsRepository["listCrews"]>>;
    checklists: Awaited<ReturnType<DrizzleOperationsRepository["listChecklists"]>>;
  }
>("turnover:read", { scope: "organization", audit: false }, async (ctx) => {
  const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
  return { crews: await ops.listCrews(), checklists: await ops.listChecklists() };
});

// ---- blocks, owner stays, OOO/OOS (spec 08 §8.11, spec 03 §3.6) ---------------------------

export const loadBlocks = withPermission<
  [],
  {
    blocks: Awaited<ReturnType<DrizzleOperationsRepository["listBlocks"]>>;
    units: Array<{
      id: string;
      name: string;
      propertyId: string;
      propertyTitle: string;
      roomTypeId: string;
      status: string;
    }>;
  }
>("block:manage", { scope: "organization", audit: false }, async (ctx) => {
  const units = await rawRows<{
    id: string;
    name: string;
    propertyId: string;
    propertyTitle: string;
    roomTypeId: string;
    status: string;
  }>(
    ctx.tx,
    sql`select u.id, u.name, u.property_id as "propertyId", p.title as "propertyTitle", u.room_type_id as "roomTypeId", u.status from unit u join property p on p.id = u.property_id where u.archived_at is null order by p.title, u.name`,
  );
  return { blocks: await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).listBlocks(), units };
});

export const createBlockAction = withPermission<[FormData], void>(
  "block:manage",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "unit_block", id: String(fd.get("unitId")) }),
  },
  async (ctx, fd) => {
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const propertyId = String(fd.get("propertyId"));
    const roomTypeId = String(fd.get("roomTypeId"));
    const reduces = fd.get("reducesAvailability") !== "off";
    await ops.insertBlock({
      id: Id.next(),
      propertyId,
      roomTypeId,
      unitId: String(fd.get("unitId") || "") || null,
      dateFrom: String(fd.get("dateFrom")),
      dateTo: String(fd.get("dateTo")),
      reason: String(fd.get("reason") || "maintenance"),
      reducesAvailability: reduces,
      note: String(fd.get("note") || "") || undefined,
      createdBy: ctx.userId,
    });
    if (reduces)
      await recomputeAvailability(
        ctx.tx,
        ctx.orgId,
        propertyId,
        roomTypeId,
        String(fd.get("dateFrom")),
        String(fd.get("dateTo")),
        Date.now(),
        "block",
      );
    revalidatePath("/operations/blocks");
    revalidatePath("/calendar");
  },
);

export const cancelBlockAction = withPermission<[FormData], void>(
  "block:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "unit_block", id: String(fd.get("blockId")) }),
  },
  async (ctx, fd) => {
    const b = await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).cancelBlock(
      String(fd.get("blockId")),
    );
    if (b)
      await recomputeAvailability(
        ctx.tx,
        ctx.orgId,
        b.propertyId,
        b.roomTypeId,
        b.dateFrom,
        b.dateTo,
        Date.now(),
        "block_cancelled",
      );
    revalidatePath("/operations/blocks");
  },
);

export const setUnitStatusAction = withPermission<[FormData], void>(
  "unit:update_status",
  { scope: "organization", subject: (fd) => ({ kind: "unit", id: String(fd.get("unitId")) }) },
  async (ctx, fd) => {
    const c = await container();
    const unitId = String(fd.get("unitId"));
    const status = String(fd.get("status"));
    const [u] = await rawRows<{
      property_id: string;
      room_type_id: string;
      status: string;
      timezone: string;
    }>(
      ctx.tx,
      sql`select u.property_id, u.room_type_id, u.status, p.timezone from unit u join property p on p.id = u.property_id where u.id = ${unitId}`,
    );
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).setUnitStatus(unitId, status);
    if (u && (status === "out_of_order" || u.status === "out_of_order")) {
      const today = c.clock.today(u.timezone);
      await recomputeAvailability(
        ctx.tx,
        ctx.orgId,
        u.property_id,
        u.room_type_id,
        today.toString(),
        today.plusDays(120).toString(),
        Date.now(),
        "unit_status",
      );
    }
    revalidatePath("/operations/blocks");
    revalidatePath("/front-desk");
  },
);

// ---- maintenance (spec 08 §8.8) ------------------------------------------------------------

export const loadIssues = withPermission<
  [],
  Awaited<ReturnType<DrizzleOperationsRepository["listIssues"]>>
>("maintenance:read", { scope: "organization", audit: false }, (ctx) =>
  new DrizzleOperationsRepository(ctx.tx, ctx.orgId).listIssues(),
);

export const createIssueAction = withPermission<[FormData], void>(
  "maintenance:create",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "maintenance_issue", id: String(fd.get("unitId") || "property") }),
  },
  async (ctx, fd) => {
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const id = Id.next();
    const propertyId = String(fd.get("propertyId"));
    const unitId = String(fd.get("unitId") || "") || null;
    const blocks = fd.get("blocksAvailability") === "on";
    await ops.insertIssue({
      id,
      propertyId,
      unitId,
      taskId: String(fd.get("taskId") || "") || undefined,
      reportedBy: ctx.userId,
      reportedVia: String(fd.get("reportedVia") || "staff"),
      severity: String(fd.get("severity") || "normal"),
      category: String(fd.get("category") || "general"),
      description: String(fd.get("description")),
      photos: fd.getAll("photo").map(String).filter(Boolean),
      blocksAvailability: blocks,
    });
    if (blocks && unitId) {
      const c = await container();
      const [u] = await rawRows<{ room_type_id: string; timezone: string }>(
        ctx.tx,
        sql`select u.room_type_id, p.timezone from unit u join property p on p.id = u.property_id where u.id = ${unitId}`,
      );
      if (u) {
        const today = c.clock.today(u.timezone);
        await ops.insertBlock({
          id: Id.next(),
          propertyId,
          roomTypeId: u.room_type_id,
          unitId,
          dateFrom: today.toString(),
          dateTo: today.plusDays(Number(fd.get("blockDays") || 3)).toString(),
          reason: "maintenance",
          reducesAvailability: true,
          maintenanceIssueId: id,
          createdBy: ctx.userId,
        });
        await recomputeAvailability(
          ctx.tx,
          ctx.orgId,
          propertyId,
          u.room_type_id,
          today.toString(),
          today.plusDays(Number(fd.get("blockDays") || 3)).toString(),
          Date.now(),
          "maintenance_block",
        );
      }
    }
    revalidatePath("/maintenance");
  },
);

export const updateIssueAction = withPermission<[FormData], void>(
  "maintenance:update",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "maintenance_issue", id: String(fd.get("issueId")) }),
  },
  async (ctx, fd) => {
    const cost = fd.get("cost") ? Math.round(Number(fd.get("cost")) * 100) : null;
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).updateIssue(
      String(fd.get("issueId")),
      {
        state: String(fd.get("state") || "open"),
        vendor: String(fd.get("vendor") || "") || null,
        costMinor: cost,
        rebillToOwner: fd.get("rebillToOwner") === "on",
        ...(fd.get("assigneeId") ? { assigneeId: String(fd.get("assigneeId")) } : {}),
      },
    );
    revalidatePath("/maintenance");
  },
);

// ---- cleaner (spec 08 §8.7) ---------------------------------------------------------------

export const loadMyDay = withPermission<[string], MyDay>(
  "turnover:read_own",
  { scope: "organization", audit: false },
  (ctx, date) => myDay(ctx, date),
);

export const completeTaskAction = withPermission<[TaskUpdate], { state: TaskState }>(
  "turnover:complete",
  { scope: "organization", subject: (i) => ({ kind: "turnover_task", id: i.taskId }) },
  (ctx, input) => updateTask(ctx, input),
);

export const reportIssueFromTaskAction = withPermission<
  [{ taskId: string; description: string; severity?: string; photos?: string[] }],
  { issueId: string }
>(
  "maintenance:create",
  { scope: "organization", subject: (i) => ({ kind: "turnover_task", id: i.taskId }) },
  async (ctx, input) => {
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    const task = await ops.task(input.taskId);
    if (!task) throw new HttpProblem(404, "not_found", "Task not found");
    const id = Id.next();
    await ops.insertIssue({
      id,
      propertyId: task.propertyId,
      unitId: task.unitId,
      taskId: task.id,
      reportedBy: ctx.userId,
      reportedVia: "cleaner",
      severity: input.severity ?? "normal",
      category: "general",
      description: input.description,
      photos: input.photos ?? [],
    });
    return { issueId: id };
  },
);

// ---- front desk (spec 08 §8.10) -----------------------------------------------------------

export const loadFrontDesk = withPermission<
  [{ propertyId: string; date: string }],
  {
    rack: Awaited<ReturnType<DrizzleReservationRepository["roomRack"]>>;
    today: { arrivals: Board["arrivals"]; departures: Board["departures"]; inHouse: number };
  }
>(
  "booking:read",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, { propertyId, date }) => {
    const c = await container();
    const rack = await new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).roomRack(
      propertyId,
      date,
      addDays(date, 13),
    );
    const board = await loadBoardFor(ctx.tx, propertyId, date);
    return { rack, today: board };
  },
);

async function loadBoardFor(tx: Parameters<typeof rawRows>[0], propertyId: string, date: string) {
  const arrivals = await rawRows<Board["arrivals"][number]>(
    tx,
    sql`select b.id as "bookingId", p.title as "propertyTitle", u.name as "unitName", coalesce(br.guest_names->0->>'surname', '') as guest, '15:00' as "checkInTime", 0 as credentials, u.status as "unitStatus" from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id left join unit u on u.id = br.assigned_unit_id where b.property_id = ${propertyId} and b.arrival_date = ${date} and b.status <> 'cancelled'`,
  );
  const departures = await rawRows<Board["departures"][number]>(
    tx,
    sql`select b.id as "bookingId", p.title as "propertyTitle", u.name as "unitName", coalesce(br.guest_names->0->>'surname', '') as guest, '10:00' as "checkOutTime" from booking b join property p on p.id = b.property_id join booking_room br on br.booking_id = b.id left join unit u on u.id = br.assigned_unit_id where b.property_id = ${propertyId} and b.departure_date = ${date} and b.status <> 'cancelled'`,
  );
  const [inHouse] = await rawRows<{ n: number }>(
    tx,
    sql`select count(*)::int as n from booking b where b.property_id = ${propertyId} and b.arrival_date <= ${date} and b.departure_date > ${date} and b.status <> 'cancelled'`,
  );
  return { arrivals, departures, inHouse: inHouse?.n ?? 0 };
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
