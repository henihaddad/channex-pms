import type { Clock } from "../shared/clock.js";
import { Id } from "../shared/id.js";
import type { DomainEvent } from "../shared/domain-event.js";
import type {
  BookingRevisionPayload,
  CallMeta,
  ConnectivityProvider,
} from "../connectivity/port.js";
import type { BookingRepository, IngestAlerts } from "./ports.js";
import { diffProjection, isNewerThan, projectRevision } from "./projection.js";

export interface IngestDeps {
  provider: ConnectivityProvider;
  repo: BookingRepository;
  clock: Clock;
  orgId: string;
  alerts?: IngestAlerts;
  log?: { info(o: object, m: string): void; warn(o: object, m: string): void };
}

export interface IngestSummary {
  seen: number;
  applied: number;
  duplicates: number;
  reacked: number;
  acked: number;
  ackFailures: number;
  stale: number;
}

export const ACK_SWEEP_AFTER_MS = 5 * 60 * 1000;
export const ACK_ALERT_AFTER_MS = 10 * 60 * 1000;

/**
 * Pull the revisions feed for a property and apply the ack loop (spec 05 §5.6):
 * duplicate → skip; stored but unacked → re-ack; new → transaction then ack.
 * The ack happens only after the local transaction commits (BK-1, CX-6).
 */
export async function ingestProperty(
  deps: IngestDeps,
  propertyId: string,
  meta: CallMeta,
): Promise<IngestSummary> {
  const s: IngestSummary = {
    seen: 0,
    applied: 0,
    duplicates: 0,
    reacked: 0,
    acked: 0,
    ackFailures: 0,
    stale: 0,
  };
  let cursor: string | undefined;
  do {
    const page = await deps.provider.listBookingRevisions(propertyId, cursor, {
      ...meta,
      dedupeKey: `${meta.dedupeKey}:feed:${cursor ?? "1"}`,
    });
    for (const rev of page.revisions) {
      s.seen += 1;
      const existing = await deps.repo.findRevisionBySystemId(rev.systemId);
      if (existing?.ackedAt) {
        s.duplicates += 1;
        continue;
      }
      if (existing) {
        s.reacked += 1;
        await ack(deps, [existing.channexRevisionId], meta, s);
        continue;
      }
      await applyOne(deps, rev, s);
      await ack(deps, [rev.revisionId], meta, s);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return s;
}

/** Apply a single revision (also used by the webhook-triggered path after a targeted pull). */
export async function applyOne(
  deps: IngestDeps,
  rev: BookingRevisionPayload,
  s: IngestSummary,
): Promise<void> {
  const now = deps.clock.now().toString();
  const prev = await deps.repo.loadProjection(rev.bookingId);
  const bookingId = prev?.bookingId ?? Id.next();
  if (!isNewerThan(rev, prev)) {
    // out-of-order delivery: keep the history, never regress the projection (BK-5)
    s.stale += 1;
    await deps.repo.applyRevision({ revision: rev, projection: null, diff: null, events: [], now });
    return;
  }
  const next = projectRevision(rev, bookingId);
  const diff = diffProjection(prev, next);
  const events: Array<Omit<DomainEvent, "id">> = [
    {
      type: "booking.revision_applied",
      orgId: deps.orgId as Id,
      aggregate: { kind: "booking", id: bookingId as Id },
      payload: {
        bookingId,
        propertyId: rev.propertyId,
        revisionId: rev.revisionId,
        status: rev.status,
        diff,
      },
      occurredAt: now,
      dedupeKey: `booking.revision_applied:${rev.systemId}`,
    },
  ];
  if (diff.mappingState !== "mapped") {
    events.push({
      type: "booking.unmapped",
      orgId: deps.orgId as Id,
      aggregate: { kind: "booking", id: bookingId as Id },
      payload: { bookingId, propertyId: rev.propertyId, mappingState: diff.mappingState },
      occurredAt: now,
      dedupeKey: `booking.unmapped:${rev.systemId}`,
    });
    await deps.alerts?.unmappedBooking({
      bookingId,
      propertyId: rev.propertyId,
      mappingState: diff.mappingState,
    });
  }
  await deps.repo.applyRevision({ revision: rev, projection: next, diff, events, now });
  s.applied += 1;
}

async function ack(
  deps: IngestDeps,
  channexRevisionIds: string[],
  meta: CallMeta,
  s: IngestSummary,
): Promise<void> {
  try {
    await deps.provider.ackBookingRevisions(channexRevisionIds, {
      ...meta,
      dedupeKey: `${meta.dedupeKey}:ack`,
    });
    await deps.repo.markAcked(channexRevisionIds, deps.clock.now().toString());
    s.acked += channexRevisionIds.length;
  } catch (e) {
    // stored but unacked: the sweep re-acks; Channex keeps re-serving it, which findRevisionBySystemId absorbs
    s.ackFailures += channexRevisionIds.length;
    deps.log?.warn(
      { ids: channexRevisionIds, err: e instanceof Error ? e.message : String(e) },
      "booking.ack.failed",
    );
  }
}

/** Safety net (BK-3): re-ack anything unacked after 5 minutes; alert after 10, inside Channex's 30-minute warning. */
export async function ackSweep(
  deps: IngestDeps,
  meta: CallMeta,
): Promise<{ reacked: number; alerted: number; failed: number }> {
  const nowMs = deps.clock.now().epochMilliseconds;
  const before = new Date(nowMs - ACK_SWEEP_AFTER_MS).toISOString();
  const stale = await deps.repo.listUnacked(before);
  let reacked = 0;
  let alerted = 0;
  let failed = 0;
  for (const r of stale) {
    const ageMs = nowMs - new Date(r.receivedAt).getTime();
    if (ageMs >= ACK_ALERT_AFTER_MS) {
      alerted += 1;
      await deps.alerts?.ackLagging({ revisionId: r.revisionId, propertyId: r.propertyId, ageMs });
    }
    try {
      await deps.provider.ackBookingRevisions([r.channexRevisionId], {
        ...meta,
        dedupeKey: `${meta.dedupeKey}:sweep:${r.channexRevisionId}`,
      });
      await deps.repo.markAcked([r.channexRevisionId], deps.clock.now().toString());
      reacked += 1;
    } catch {
      failed += 1;
    }
  }
  return { reacked, alerted, failed };
}
