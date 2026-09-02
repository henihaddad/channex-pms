import type { AvailabilityCell, RateCell } from "./ari.js";

export type CellRef =
  | { kind: "rate"; ratePlanId: string; date: string }
  | { kind: "availability"; roomTypeId: string; date: string };

export type CellOutcome = CellRef & { version: number } & (
    { status: "synced" } | { status: "failed"; reason: string }
  );

export interface PendingAri {
  rate: Array<RateCell & { version: number }>;
  availability: Array<AvailabilityCell & { version: number }>;
}

/** The ARI cell store the push pipeline drives (spec 05 §5.4.5). Implemented over Drizzle and in memory. */
export interface AriCellStore {
  loadPending(propertyId: string): Promise<PendingAri>;
  markInFlight(propertyId: string, cells: Array<CellRef & { version: number }>): Promise<void>;
  /** Applies outcomes only where the cell's version is unchanged; cells edited mid-flight stay pending. */
  applyOutcomes(propertyId: string, outcomes: CellOutcome[]): Promise<void>;
  markConflicted(propertyId: string, cells: CellRef[]): Promise<void>;
  loadDesired(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ rate: RateCell[]; availability: AvailabilityCell[] }>;
}

export const cellKey = (c: CellRef): string =>
  c.kind === "rate" ? `rate|${c.ratePlanId}|${c.date}` : `availability|${c.roomTypeId}|${c.date}`;
