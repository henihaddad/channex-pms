import {
  RESTRICTION_FIELDS,
  type AvailabilityCell,
  type AvailabilityEntry,
  type BatchLimits,
  type RateCell,
  type RestrictionEntry,
  type RestrictionField,
  type RestrictionValues,
  type Weekday,
  DEFAULT_BATCH_LIMITS,
} from "@pms/core";
import { contiguousSpans } from "./dates.js";
import { encodeSpan, type FieldEntry } from "./encode.js";

const canon = (v: unknown): string =>
  JSON.stringify(v, v && typeof v === "object" ? Object.keys(v).sort() : undefined);

/**
 * Build the fewest `values[]` entries that reproduce `cells` exactly when
 * applied FIFO to an empty state (spec 05 §5.4.3). Entries are grouped by rate
 * plan and merged when their ranges coincide, then chunked.
 */
export function buildRestrictionBatch(
  cells: readonly RateCell[],
  limits: BatchLimits = DEFAULT_BATCH_LIMITS,
): RestrictionEntry[][] {
  const byPlan = groupBy(cells, (c) => c.ratePlanId);
  const entries: RestrictionEntry[] = [];
  for (const [ratePlanId, planCells] of [...byPlan].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const byDate = new Map(planCells.map((c) => [c.date, c.values] as const));
    const dates = [...byDate.keys()].sort();
    const fieldEntries: Array<{
      field: RestrictionField;
      entry: FieldEntry<unknown>;
      order: number;
    }> = [];
    let order = 0;
    for (const field of RESTRICTION_FIELDS) {
      const datesWithField = dates.filter((d) => byDate.get(d)![field] !== undefined);
      for (const span of contiguousSpans(datesWithField)) {
        for (const e of encodeSpan(span, (d) => byDate.get(d)![field], canon))
          fieldEntries.push({ field, entry: e, order: order++ });
      }
    }
    // Merge entries with identical range and days across fields, but never move an entry of
    // field F before an earlier entry of F: FIFO order within a field is what makes overrides work.
    const merged: RestrictionEntry[] = [];
    const indexByKey = new Map<string, number>();
    const lastIndexOfField = new Map<RestrictionField, number>();
    for (const { field, entry } of fieldEntries) {
      const k = `${entry.dateFrom}|${entry.dateTo}|${(entry.days ?? []).join(",")}`;
      const existing = indexByKey.get(k);
      const floor = lastIndexOfField.get(field) ?? -1;
      if (existing !== undefined && existing > floor) {
        (merged[existing] as unknown as Record<string, unknown>)[field] = entry.value;
        lastIndexOfField.set(field, existing);
      } else {
        const e: RestrictionEntry = {
          ratePlanId,
          dateFrom: entry.dateFrom,
          dateTo: entry.dateTo,
          ...(entry.days ? { days: entry.days } : {}),
        };
        (e as unknown as Record<string, unknown>)[field] = entry.value;
        merged.push(e);
        indexByKey.set(k, merged.length - 1);
        lastIndexOfField.set(field, merged.length - 1);
      }
    }
    entries.push(...merged);
  }
  return chunk(entries, limits.maxEntries);
}

export function buildAvailabilityBatch(
  cells: readonly AvailabilityCell[],
  limits: BatchLimits = DEFAULT_BATCH_LIMITS,
): AvailabilityEntry[][] {
  const entries: AvailabilityEntry[] = [];
  for (const [roomTypeId, rtCells] of [...groupBy(cells, (c) => c.roomTypeId)].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const byDate = new Map(rtCells.map((c) => [c.date, c.availability] as const));
    for (const span of contiguousSpans([...byDate.keys()].sort())) {
      for (const e of encodeSpan(span, (d) => byDate.get(d)!, String)) {
        entries.push({
          roomTypeId,
          dateFrom: e.dateFrom,
          dateTo: e.dateTo,
          ...(e.days ? { days: e.days } : {}),
          availability: e.value,
        });
      }
    }
  }
  return chunk(entries, limits.maxEntries);
}

/** Number of entries a naive one-per-cell-per-field encoding would need. */
export function naiveRestrictionEntryCount(cells: readonly RateCell[]): number {
  return cells.length;
}

function groupBy<T>(items: readonly T[], keyOf: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  }
  return m;
}

function chunk<T>(list: T[], size: number): T[][] {
  if (list.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export type { RestrictionValues, Weekday };
