/** Units and the stays already placed on them, for auto-assignment (spec 08 §8.4). */
export interface UnitCandidate {
  id: string;
  roomTypeId: string;
  attributes: Record<string, unknown>;
  status: string;
  /** Existing stays as half-open date ranges. */
  busy: Array<{ from: string; to: string; bookingId: string }>;
}

export interface AssignmentRequest {
  bookingId: string;
  bookingRoomId: string;
  roomTypeId: string;
  checkinDate: string;
  checkoutDate: string;
  wants?: Record<string, unknown>;
  currentUnitId?: string | null;
}

export interface AssignmentSuggestion {
  bookingRoomId: string;
  unitId: string | null;
  warnings: string[];
}

const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }): boolean =>
  a.from < b.to && b.from < a.to;

/**
 * Auto-assign: keep stays contiguous, minimise moves. A room already assigned
 * keeps its unit when still free; otherwise the free unit that ends the tightest
 * gap before the stay (least fragmentation) wins. Attribute mismatches warn, they
 * do not block. Out-of-order units are skipped; out-of-service ones are not (spec 03 §3.6).
 */
export function autoAssign(
  requests: readonly AssignmentRequest[],
  units: readonly UnitCandidate[],
): AssignmentSuggestion[] {
  const busy = new Map(
    units.map((u) => [
      u.id,
      u.busy
        .filter((b) => !requests.some((r) => r.bookingId === b.bookingId))
        .map((b) => ({ ...b })),
    ]),
  );
  const out: AssignmentSuggestion[] = [];
  const ordered = [...requests].sort(
    (a, b) =>
      a.checkinDate.localeCompare(b.checkinDate) || a.bookingRoomId.localeCompare(b.bookingRoomId),
  );
  for (const r of ordered) {
    const range = { from: r.checkinDate, to: r.checkoutDate };
    const free = units.filter(
      (u) =>
        u.roomTypeId === r.roomTypeId &&
        u.status !== "out_of_order" &&
        !(busy.get(u.id) ?? []).some((b) => overlaps(b, range)),
    );
    const warnings: string[] = [];
    let pick: UnitCandidate | undefined = r.currentUnitId
      ? free.find((u) => u.id === r.currentUnitId)
      : undefined;
    if (!pick) {
      const gap = (u: UnitCandidate): number => {
        const before = (busy.get(u.id) ?? [])
          .filter((b) => b.to <= range.from)
          .map((b) => b.to)
          .sort()
          .at(-1);
        return before
          ? Math.round((Date.parse(range.from) - Date.parse(before)) / 86_400_000)
          : 9999;
      };
      const mismatch = (u: UnitCandidate): number =>
        Object.entries(r.wants ?? {}).filter(([k, v]) => u.attributes[k] !== v).length;
      pick = [...free].sort(
        (a, b) => mismatch(a) - mismatch(b) || gap(a) - gap(b) || a.id.localeCompare(b.id),
      )[0];
      if (r.currentUnitId && pick) warnings.push("moved from the previously assigned unit");
    }
    if (!pick) {
      out.push({
        bookingRoomId: r.bookingRoomId,
        unitId: null,
        warnings: ["no free unit of this room type for the whole stay"],
      });
      continue;
    }
    for (const [k, v] of Object.entries(r.wants ?? {}))
      if (pick.attributes[k] !== v) warnings.push(`unit lacks ${k}=${String(v)}`);
    busy.get(pick.id)?.push({ ...range, bookingId: r.bookingId });
    out.push({ bookingRoomId: r.bookingRoomId, unitId: pick.id, warnings });
  }
  return out;
}
