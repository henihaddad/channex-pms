import type { AvailabilityCell, RateCell, RestrictionValues, SyncState } from "@pms/core";
import {
  cellKey,
  type AriCellStore,
  type CellOutcome,
  type CellRef,
  type PendingAri,
} from "@pms/core";

interface RateRow {
  ratePlanId: string;
  date: string;
  values: RestrictionValues;
  synced: RestrictionValues | null;
  state: SyncState;
  version: number;
  lastError?: string;
}
interface AvailRow {
  roomTypeId: string;
  date: string;
  available: number;
  synced: number | null;
  state: SyncState;
  version: number;
  lastError?: string;
}

/** In-memory ARI cell store with the same semantics as the Drizzle one. Used by unit tests and the chaos runner. */
export class MemoryAriStore implements AriCellStore {
  readonly rate = new Map<string, RateRow>();
  readonly availability = new Map<string, AvailRow>();

  /** A local edit: desired changes, version bumps, state returns to pending (CAL-3). */
  setRate(ratePlanId: string, date: string, values: RestrictionValues): void {
    const k = cellKey({ kind: "rate", ratePlanId, date });
    const prev = this.rate.get(k);
    this.rate.set(k, {
      ratePlanId,
      date,
      values: { ...(prev?.values ?? {}), ...values },
      synced: prev?.synced ?? null,
      state: "pending",
      version: (prev?.version ?? 0) + 1,
    });
  }

  setAvailability(roomTypeId: string, date: string, available: number): void {
    const k = cellKey({ kind: "availability", roomTypeId, date });
    const prev = this.availability.get(k);
    this.availability.set(k, {
      roomTypeId,
      date,
      available,
      synced: prev?.synced ?? null,
      state: "pending",
      version: (prev?.version ?? 0) + 1,
    });
  }

  async loadPending(): Promise<PendingAri> {
    const pendingStates = new Set<SyncState>(["pending", "failed", "conflicted"]);
    return {
      rate: [...this.rate.values()]
        .filter((r) => pendingStates.has(r.state) && r.lastError !== "validation")
        .map((r) => ({
          ratePlanId: r.ratePlanId,
          date: r.date,
          values: r.values,
          version: r.version,
        })),
      availability: [...this.availability.values()]
        .filter((r) => pendingStates.has(r.state) && r.lastError !== "validation")
        .map((r) => ({
          roomTypeId: r.roomTypeId,
          date: r.date,
          availability: r.available,
          version: r.version,
        })),
    };
  }

  async markInFlight(_p: string, cells: Array<CellRef & { version: number }>): Promise<void> {
    for (const c of cells) {
      const row = this.row(c);
      if (row && row.version === c.version) row.state = "in_flight";
    }
  }

  async applyOutcomes(_p: string, outcomes: CellOutcome[]): Promise<void> {
    for (const o of outcomes) {
      const row = this.row(o);
      if (!row || row.version !== o.version) continue; // edited mid-flight: stays pending with its new version
      if (o.status === "synced") {
        row.state = "synced";
        delete row.lastError;
        if ("values" in row) row.synced = { ...row.values };
        else row.synced = row.available;
      } else if (o.reason === "retry") {
        row.state = "pending";
        delete row.lastError;
      } else {
        row.state = "failed";
        row.lastError = "validation";
      }
    }
  }

  async markConflicted(_p: string, cells: CellRef[]): Promise<void> {
    for (const c of cells) {
      const row = this.row(c);
      if (row) {
        row.state = "conflicted";
        delete row.lastError;
      }
    }
  }

  async loadDesired(
    _p: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ rate: RateCell[]; availability: AvailabilityCell[] }> {
    return {
      rate: [...this.rate.values()]
        .filter((r) => r.date >= dateFrom && r.date <= dateTo)
        .map((r) => ({ ratePlanId: r.ratePlanId, date: r.date, values: r.values })),
      availability: [...this.availability.values()]
        .filter((r) => r.date >= dateFrom && r.date <= dateTo)
        .map((r) => ({ roomTypeId: r.roomTypeId, date: r.date, availability: r.available })),
    };
  }

  states(): Record<SyncState, number> {
    const out: Record<SyncState, number> = {
      pending: 0,
      in_flight: 0,
      synced: 0,
      failed: 0,
      conflicted: 0,
    };
    for (const r of this.rate.values()) out[r.state] += 1;
    for (const r of this.availability.values()) out[r.state] += 1;
    return out;
  }

  private row(c: CellRef): RateRow | AvailRow | undefined {
    return c.kind === "rate" ? this.rate.get(cellKey(c)) : this.availability.get(cellKey(c));
  }
}
