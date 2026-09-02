/**
 * Queue taxonomy (spec 04 §4.5). Names are the contract between producers in
 * apps/web and consumers in apps/worker. Every job is idempotent and carries a
 * dedupeKey used as the BullMQ jobId.
 */
export const QUEUES = {
  webhookIngest: "webhook.ingest",
  ariPush: "ari.push",
  bookingProcess: "booking.process",
  bookingAckSweep: "booking.ack_sweep",
  messagesSync: "messages.sync",
  automationRun: "automation.run",
  reconcileAri: "reconcile.ari",
  reportsBuild: "reports.build",
  notifyDeliver: "notify.deliver",
  system: "system",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Priority: lower runs first. Anything that can lose money outranks anything cosmetic. */
export const PRIORITY = { critical: 1, high: 3, normal: 5, low: 10 } as const;

export interface JobEnvelope<T = unknown> {
  orgId: string;
  dedupeKey: string;
  requestId?: string;
  payload: T;
}
