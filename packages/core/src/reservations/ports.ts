import type { BookingRevisionPayload } from "../connectivity/port.js";
import type { DomainEvent } from "../shared/domain-event.js";
import type { BookingProjection, RevisionDiff } from "./types.js";

export interface StoredRevisionRef {
  revisionId: string;
  channexRevisionId: string;
  bookingId: string;
  propertyId: string;
  ackedAt: string | null;
  receivedAt: string;
}

/**
 * Persistence for ingestion. `applyRevision` is one transaction: revision row,
 * projection upsert, room nights, guest, outbox events (spec 04 §4.4).
 */
export interface BookingRepository {
  findRevisionBySystemId(systemId: string): Promise<StoredRevisionRef | null>;
  loadProjection(channexBookingId: string): Promise<BookingProjection | null>;
  applyRevision(input: {
    revision: BookingRevisionPayload;
    /** Null when the revision is stale (BK-5): history is stored, projection untouched. */
    projection: BookingProjection | null;
    diff: RevisionDiff | null;
    events: Array<Omit<DomainEvent, "id">>;
    now: string;
  }): Promise<{ revisionId: string }>;
  markAcked(revisionIds: string[], at: string): Promise<void>;
  /** Unacked revisions received before `before` (ISO). */
  listUnacked(before: string): Promise<StoredRevisionRef[]>;
}

export interface IngestAlerts {
  unmappedBooking(input: {
    bookingId: string;
    propertyId: string;
    mappingState: string;
  }): Promise<void>;
  ackLagging(input: { revisionId: string; propertyId: string; ageMs: number }): Promise<void>;
}
