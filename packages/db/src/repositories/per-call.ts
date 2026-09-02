import type {
  AriCellStore,
  AvailabilityCell,
  BookingProjection,
  BookingRepository,
  BookingRevisionPayload,
  CellOutcome,
  CellRef,
  Crypto,
  DomainEvent,
  PendingAri,
  RateCell,
  RevisionDiff,
  StoredRevisionRef,
} from "@pms/core";
import type { Db } from "../client.js";
import { asSystem } from "../tenant.js";
import { DrizzleAriStore } from "./ari.js";
import { DrizzleBookingRepository } from "./bookings.js";

/**
 * Worker-side repositories: every call is its own tenant transaction, so a
 * booking's revision commits before its ack goes out (BK-1) and the push
 * pipeline's state updates land immediately.
 */
export class BookingRepositoryPerCall implements BookingRepository {
  constructor(
    private readonly db: Db,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}
  private run<T>(fn: (r: DrizzleBookingRepository) => Promise<T>): Promise<T> {
    return asSystem(this.db, this.orgId, (tx) =>
      fn(new DrizzleBookingRepository(tx, this.orgId, this.crypto)),
    );
  }
  findRevisionBySystemId(systemId: string): Promise<StoredRevisionRef | null> {
    return this.run((r) => r.findRevisionBySystemId(systemId));
  }
  loadProjection(id: string): Promise<BookingProjection | null> {
    return this.run((r) => r.loadProjection(id));
  }
  applyRevision(input: {
    revision: BookingRevisionPayload;
    projection: BookingProjection | null;
    diff: RevisionDiff | null;
    events: Array<Omit<DomainEvent, "id">>;
    now: string;
  }): Promise<{ revisionId: string }> {
    return this.run((r) => r.applyRevision(input));
  }
  markAcked(ids: string[], at: string): Promise<void> {
    return this.run((r) => r.markAcked(ids, at));
  }
  listUnacked(before: string): Promise<StoredRevisionRef[]> {
    return this.run((r) => r.listUnacked(before));
  }
}

export class AriStorePerCall implements AriCellStore {
  constructor(
    private readonly db: Db,
    private readonly orgId: string,
  ) {}
  private run<T>(fn: (s: DrizzleAriStore) => Promise<T>): Promise<T> {
    return asSystem(this.db, this.orgId, (tx) => fn(new DrizzleAriStore(tx)));
  }
  loadPending(propertyId: string): Promise<PendingAri> {
    return this.run((s) => s.loadPending(propertyId));
  }
  markInFlight(propertyId: string, cells: Array<CellRef & { version: number }>): Promise<void> {
    return this.run((s) => s.markInFlight(propertyId, cells));
  }
  applyOutcomes(propertyId: string, outcomes: CellOutcome[]): Promise<void> {
    return this.run((s) => s.applyOutcomes(propertyId, outcomes));
  }
  markConflicted(propertyId: string, cells: CellRef[]): Promise<void> {
    return this.run((s) => s.markConflicted(propertyId, cells));
  }
  loadDesired(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ rate: RateCell[]; availability: AvailabilityCell[] }> {
    return this.run((s) => s.loadDesired(propertyId, dateFrom, dateTo));
  }
}
