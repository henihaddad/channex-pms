import { and, eq, isNull, sql } from "drizzle-orm";
import { Id, type DomainEvent } from "@pms/core";
import * as s from "../schema/index.js";
import type { Db } from "../client.js";
import { rowsOf, type Tx } from "../tenant.js";

/** Write a domain event in the caller's transaction (transactional outbox, spec 03 §3.9). */
export async function enqueueOutbox(
  tx: Tx,
  event: Omit<DomainEvent, "id"> & { id?: Id },
): Promise<DomainEvent> {
  const full: DomainEvent = { id: event.id ?? Id.next(), ...event };
  await tx
    .insert(s.outboxEvent)
    .values({
      id: full.id,
      orgId: full.orgId,
      type: full.type,
      aggregate: full.aggregate,
      payload: full.payload,
      dedupeKey: full.dedupeKey,
      requestId: full.requestId ?? null,
      occurredAt: full.occurredAt,
    })
    .onConflictDoNothing({ target: s.outboxEvent.dedupeKey });
  return full;
}

export interface OutboxPublisher {
  /** Deliver the event to the queue. Must be idempotent on dedupeKey. */
  publish(event: DomainEvent): Promise<void>;
}

/**
 * Publisher loop step: claim a batch with SKIP LOCKED, publish, mark. Runs as
 * the connecting role without a tenant setting, so it needs the pms_owner-level
 * connection (the worker's), never a tenant transaction. Exactly-once effect is
 * guaranteed by consumers checking processed_event, not by this loop.
 */
export async function drainOutbox(
  db: Db,
  publisher: OutboxPublisher,
  batch = 100,
): Promise<number> {
  return db.transaction(async (tx) => {
    const list = rowsOf(
      await tx.execute(sql`
      select id, org_id, type, aggregate, payload, dedupe_key, request_id, occurred_at
      from outbox_event where published_at is null
      order by occurred_at limit ${batch} for update skip locked`),
    );
    let published = 0;
    for (const r of list) {
      const event: DomainEvent = {
        id: r.id as Id,
        orgId: r.org_id as Id,
        type: r.type as string,
        aggregate: r.aggregate as DomainEvent["aggregate"],
        payload: r.payload,
        dedupeKey: r.dedupe_key as string,
        occurredAt: String(r.occurred_at),
        ...(r.request_id ? { requestId: r.request_id as string } : {}),
      };
      try {
        await publisher.publish(event);
        await tx.execute(
          sql`update outbox_event set published_at = now(), attempts = attempts + 1 where id = ${event.id}`,
        );
        published += 1;
      } catch {
        await tx.execute(
          sql`update outbox_event set attempts = attempts + 1 where id = ${event.id}`,
        );
      }
    }
    return published;
  });
}

/** Consumer-side idempotency: returns false when this consumer already processed the key. */
export async function claimEvent(
  tx: Tx,
  orgId: string,
  consumer: string,
  dedupeKey: string,
): Promise<boolean> {
  const rows = await tx
    .insert(s.processedEvent)
    .values({ orgId, consumer, dedupeKey })
    .onConflictDoNothing({ target: [s.processedEvent.consumer, s.processedEvent.dedupeKey] })
    .returning({ dedupeKey: s.processedEvent.dedupeKey });
  return rows.length === 1;
}

export async function pendingOutboxCount(tx: Tx, orgId: string): Promise<number> {
  const rows = await tx
    .select({ id: s.outboxEvent.id })
    .from(s.outboxEvent)
    .where(and(eq(s.outboxEvent.orgId, orgId), isNull(s.outboxEvent.publishedAt)));
  return rows.length;
}
