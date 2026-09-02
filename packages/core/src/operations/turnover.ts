import { LocalDate } from "../shared/local-date.js";
import { DomainError, err, ok, type Result } from "../shared/result.js";
import type {
  ChecklistItem,
  ChecklistProgress,
  ExistingTask,
  PlannedTask,
  PlanningOptions,
  ReplanResult,
  Stay,
  TaskState,
  TaskType,
} from "./types.js";

const DEFAULTS: Required<PlanningOptions> = {
  checkOutTime: "10:00",
  checkInTime: "15:00",
  midStayCadenceNights: 0,
  cleanMinutes: 120,
  travelMinutes: 30,
};

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (mins: number): string =>
  `${String(Math.floor(Math.max(0, mins) / 60)).padStart(2, "0")}:${String(Math.max(0, mins) % 60).padStart(2, "0")}`;

export const taskKey = (t: Pick<PlannedTask, "unitId" | "date" | "type">): string =>
  `${t.unitId}|${t.date}|${t.type}`;

/**
 * OPS-1: tasks from stays. A departure clean on every checkout date; a
 * changeover (same-day, hard window) when another stay arrives that day on the
 * same unit; a mid-stay clean per cadence for long stays. Cancelled stays plan
 * nothing. Deterministic and idempotent: same stays, same tasks.
 */
export function planTurnovers(stays: readonly Stay[], opts: PlanningOptions = {}): PlannedTask[] {
  const o = { ...DEFAULTS, ...opts };
  const active = stays.filter((s) => s.status !== "cancelled" && s.arrivalDate < s.departureDate);
  const byUnit = new Map<string, Stay[]>();
  for (const s of active) byUnit.set(s.unitId, [...(byUnit.get(s.unitId) ?? []), s]);
  const out = new Map<string, PlannedTask>();
  for (const [unitId, list] of byUnit) {
    const arrivals = new Map(list.map((s) => [s.arrivalDate, s]));
    for (const s of list) {
      const arriving = arrivals.get(s.departureDate);
      const sameDay = arriving !== undefined && arriving.bookingId !== s.bookingId;
      const windowTo = sameDay
        ? hhmm(minutes(o.checkInTime) - o.cleanMinutes - o.travelMinutes + o.cleanMinutes)
        : "23:59";
      const task: PlannedTask = {
        unitId,
        date: s.departureDate,
        type: sameDay ? "changeover" : "departure",
        windowFrom: o.checkOutTime,
        windowTo: sameDay
          ? minutes(windowTo) > minutes(o.checkOutTime)
            ? windowTo
            : o.checkInTime
          : windowTo,
        isSameDay: sameDay,
        departingBookingId: s.bookingId,
        arrivingBookingId: arriving?.bookingId ?? null,
      };
      out.set(taskKey(task), task);
      if (o.midStayCadenceNights > 0) {
        const nights = LocalDate.parse(s.arrivalDate).daysUntil(LocalDate.parse(s.departureDate));
        for (let n = o.midStayCadenceNights; n < nights; n += o.midStayCadenceNights) {
          const date = LocalDate.parse(s.arrivalDate).plusDays(n).toString();
          const mid: PlannedTask = {
            unitId,
            date,
            type: "mid_stay",
            windowFrom: "11:00",
            windowTo: "16:00",
            isSameDay: false,
            departingBookingId: s.bookingId,
            arrivingBookingId: null,
          };
          out.set(taskKey(mid), mid);
        }
      }
    }
  }
  return [...out.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.unitId.localeCompare(b.unitId) ||
      a.type.localeCompare(b.type),
  );
}

const sameShape = (a: PlannedTask, b: PlannedTask): boolean =>
  a.windowFrom === b.windowFrom &&
  a.windowTo === b.windowTo &&
  a.isSameDay === b.isSameDay &&
  a.departingBookingId === b.departingBookingId &&
  a.arrivingBookingId === b.arrivingBookingId;

/**
 * OPS-3: re-plan after a revision. Tasks keyed by (unit, date, type): missing
 * ones are created, obsolete open ones cancelled, kept ones reported as changed
 * when their window or bookings moved so the assignee is told exactly what changed.
 * Finished tasks are never touched.
 */
export function reconcileTasks(
  existing: readonly ExistingTask[],
  planned: readonly PlannedTask[],
): ReplanResult {
  const result: ReplanResult = { create: [], cancel: [], changed: [], unchanged: [] };
  const open = new Map(
    existing
      .filter((t) => t.state !== "cancelled" && t.state !== "done" && t.state !== "inspected")
      .map((t) => [taskKey(t), t]),
  );
  const seen = new Set<string>();
  for (const p of planned) {
    const key = taskKey(p);
    seen.add(key);
    const cur = open.get(key);
    if (!cur) {
      if (
        !existing.some((t) => taskKey(t) === key && (t.state === "done" || t.state === "inspected"))
      )
        result.create.push(p);
      continue;
    }
    if (sameShape(cur, p)) result.unchanged.push(cur);
    else result.changed.push({ task: cur, next: p });
  }
  for (const [key, t] of open) if (!seen.has(key)) result.cancel.push(t);
  return result;
}

const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  planned: ["assigned", "cancelled"],
  assigned: ["accepted", "planned", "assigned", "cancelled"],
  accepted: ["on_site", "assigned", "cancelled"],
  on_site: ["done", "cancelled"],
  done: ["inspected", "on_site"],
  inspected: [],
  cancelled: [],
};

/** Spec 08 §8.7 state flow; inspection optional per org. */
export function transitionTask(from: TaskState, to: TaskState): Result<TaskState> {
  if (!TRANSITIONS[from].includes(to))
    return err(new DomainError("task.transition", `cannot move a ${from} task to ${to}`));
  return ok(to);
}

/** Completing requires every item done and a photo where the checklist demands one (OPS-8). */
export function checklistBlockers(
  items: readonly ChecklistItem[],
  progress: readonly ChecklistProgress[],
): string[] {
  const done = new Map(progress.map((p) => [p.key, p]));
  const out: string[] = [];
  for (const it of items) {
    const p = done.get(it.key);
    if (!p?.done) out.push(`"${it.label}" not done`);
    else if (it.requiresPhoto && !p.photoRef) out.push(`"${it.label}" needs a photo`);
  }
  return out;
}

export const TASK_TYPES: readonly TaskType[] = [
  "changeover",
  "departure",
  "mid_stay",
  "deep",
  "inspection",
  "linen",
];
