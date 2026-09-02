import type { BookingRevisionPayload } from "../connectivity/port.js";
import type { DomainEvent } from "../shared/domain-event.js";
import { Id } from "../shared/id.js";
import type { BookingRepository, StoredRevisionRef } from "./ports.js";
import type { BookingProjection, RevisionDiff } from "./types.js";

/** In-memory booking repository with the same contract as the Drizzle one. Tests and chaos runner only. */
export class MemoryBookingRepository implements BookingRepository {
  readonly revisions = new Map<
    string,
    StoredRevisionRef & { revision: BookingRevisionPayload; diff: RevisionDiff | null }
  >(); // by systemId
  readonly projections = new Map<string, BookingProjection>(); // by channexBookingId
  readonly events: Array<Omit<DomainEvent, "id">> = [];

  async findRevisionBySystemId(systemId: string): Promise<StoredRevisionRef | null> {
    return this.revisions.get(systemId) ?? null;
  }

  async loadProjection(channexBookingId: string): Promise<BookingProjection | null> {
    return this.projections.get(channexBookingId) ?? null;
  }

  async applyRevision(input: {
    revision: BookingRevisionPayload;
    projection: BookingProjection | null;
    diff: RevisionDiff | null;
    events: Array<Omit<DomainEvent, "id">>;
    now: string;
  }): Promise<{ revisionId: string }> {
    const rev = input.revision;
    if (this.revisions.has(rev.systemId))
      throw new Error(`duplicate system_id ${rev.systemId} (INV-4)`);
    const id = Id.next();
    this.revisions.set(rev.systemId, {
      revisionId: id,
      channexRevisionId: rev.revisionId,
      bookingId:
        input.projection?.bookingId ?? this.projections.get(rev.bookingId)?.bookingId ?? "",
      propertyId: rev.propertyId,
      ackedAt: null,
      receivedAt: input.now,
      revision: rev,
      diff: input.diff,
    });
    if (input.projection) this.projections.set(rev.bookingId, input.projection);
    this.events.push(...input.events);
    return { revisionId: id };
  }

  async markAcked(channexRevisionIds: string[], at: string): Promise<void> {
    for (const r of this.revisions.values())
      if (channexRevisionIds.includes(r.channexRevisionId)) r.ackedAt = at;
  }

  async listUnacked(before: string): Promise<StoredRevisionRef[]> {
    return [...this.revisions.values()].filter((r) => !r.ackedAt && r.receivedAt <= before);
  }
}
