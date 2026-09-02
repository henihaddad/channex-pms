import type { ExistingTask, RoutePlan, RoutePoint, RouteWorker } from "./types.js";

const R = 6371;
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** City travel estimate: 20 km/h door to door plus 5 minutes of parking and stairs. */
export const travelMinutes = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => Math.round((haversineKm(a, b) / 20) * 60) + 5;

const addMin = (iso: string, m: number): string =>
  new Date(new Date(iso).getTime() + m * 60_000).toISOString();

/**
 * OPS-2: suggested routing. Greedy, in the spec's words "no route-optimisation
 * research project": tasks sorted by deadline, each given to the worker who can
 * reach it soonest without breaking their capacity; each worker's day is then the
 * order of their pickups. Deterministic for equal inputs.
 */
export function suggestRoute(
  tasks: readonly RoutePoint[],
  workers: readonly RouteWorker[],
): { plans: RoutePlan[]; unassigned: string[] } {
  const state = workers.map((w) => ({
    w,
    at: { lat: w.lat, lng: w.lng },
    time: w.startsAt,
    used: 0,
    stops: [] as RoutePlan["stops"],
  }));
  const unassigned: string[] = [];
  const ordered = [...tasks].sort(
    (a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id),
  );
  for (const t of ordered) {
    let best: (typeof state)[number] | null = null;
    let bestArrival = "";
    let bestTravel = 0;
    for (const s of state) {
      const travel = travelMinutes(s.at, t);
      if (s.used + travel + t.durationMinutes > s.w.capacityMinutes) continue;
      const arrival = addMin(s.time, travel);
      if (!best || arrival < bestArrival || (arrival === bestArrival && s.w.id < best.w.id)) {
        best = s;
        bestArrival = arrival;
        bestTravel = travel;
      }
    }
    if (!best) {
      unassigned.push(t.id);
      continue;
    }
    const end = addMin(bestArrival, t.durationMinutes);
    best.stops.push({
      taskId: t.id,
      sequence: best.stops.length + 1,
      travelMinutesEstimate: bestTravel,
      etaStart: bestArrival,
      etaEnd: end,
      late: end > t.deadline,
    });
    best.at = { lat: t.lat, lng: t.lng };
    best.time = end;
    best.used += bestTravel + t.durationMinutes;
  }
  return { plans: state.map((s) => ({ workerId: s.w.id, stops: s.stops })), unassigned };
}

export type EscalationLevel = "coordinator" | "property_manager";

/**
 * OPS-4: unassigned same-day changeovers within N hours of their window end
 * escalate to the coordinator, and past a second threshold to the property manager.
 */
export function dueEscalations(
  tasks: readonly (ExistingTask & { timezone: string })[],
  nowIso: string,
  thresholds: { coordinatorHours: number; managerHours: number } = {
    coordinatorHours: 6,
    managerHours: 3,
  },
): Array<{ task: ExistingTask; level: EscalationLevel; minutesLeft: number }> {
  const out: Array<{ task: ExistingTask; level: EscalationLevel; minutesLeft: number }> = [];
  const now = new Date(nowIso).getTime();
  for (const t of tasks) {
    if (
      !t.isSameDay ||
      t.assigneeId ||
      t.state === "cancelled" ||
      t.state === "done" ||
      t.state === "inspected"
    )
      continue;
    const deadline = localToInstant(t.date, t.windowTo, t.timezone);
    const minutesLeft = Math.round((deadline - now) / 60_000);
    if (minutesLeft <= thresholds.managerHours * 60)
      out.push({ task: t, level: "property_manager", minutesLeft });
    else if (minutesLeft <= thresholds.coordinatorHours * 60)
      out.push({ task: t, level: "coordinator", minutesLeft });
  }
  return out;
}

/** Local wall time on a date in a zone → epoch ms, without a Temporal dependency in hot paths. */
export function localToInstant(date: string, time: string, timeZone: string): number {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`,
  );
  return guess - (asIfUtc - guess);
}
