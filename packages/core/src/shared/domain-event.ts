import type { Id } from "./id.js";

/**
 * Envelope for events written to the transactional outbox in the same
 * transaction as the state change they describe (spec 03 §3.9).
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  id: Id;
  type: TType;
  orgId: Id;
  aggregate: { kind: string; id: Id };
  payload: TPayload;
  occurredAt: string;
  /** Idempotency key for consumers; also the BullMQ jobId. */
  dedupeKey: string;
  requestId?: string;
}
