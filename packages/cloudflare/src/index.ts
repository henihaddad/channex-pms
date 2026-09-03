import type { DomainEvent } from "@pms/core";
import type { OutboxPublisher } from "@pms/db";
import { routeEvent, type Enqueue } from "@pms/jobs";
import { QUEUES, type QueueName } from "@pms/runtime";

/** Every Cloudflare Queue message carries the same envelope, whichever queue it rides. */
export interface QueueMessage {
  /** Job name: the event type for outbox events, the scheduler name for system jobs. */
  name: string;
  data: unknown;
  /** Dedupe key where the producer had one; Queues have no dedupe, consumers stay idempotent. */
  jobId?: string;
}

/** Structural view of a Queue producer binding, so this package needs no Workers types. */
export interface QueueProducer {
  send(
    body: QueueMessage,
    options?: { delaySeconds?: number; contentType?: "json" },
  ): Promise<void>;
}

/** Binding name for a queue: `ari.push` → `Q_ARI_PUSH`. */
export const queueBinding = (q: QueueName): string => `Q_${q.toUpperCase().replace(/[.-]/g, "_")}`;

/** Cloudflare resource name for a queue: `ari.push` → `<prefix>-ari-push`. */
export const queueResourceName = (q: QueueName, prefix = "otabridge"): string =>
  `${prefix}-${q.replace(/[._]/g, "-")}`;

export const ALL_QUEUES: readonly QueueName[] = Object.values(QUEUES);

/** The queues a jobs worker consumes (spec 04 §4.5); reports and notifications have no consumer yet. */
export const CONSUMED_QUEUES: readonly QueueName[] = [
  QUEUES.ariPush,
  QUEUES.bookingProcess,
  QUEUES.webhookIngest,
  QUEUES.reconcileAri,
  QUEUES.messagesSync,
  QUEUES.automationRun,
  QUEUES.system,
];

export function queueOf(env: Record<string, unknown>, q: QueueName): QueueProducer {
  const binding = env[queueBinding(q)] as QueueProducer | undefined;
  if (!binding) throw new Error(`queue binding ${queueBinding(q)} is missing`);
  return binding;
}

/** Producer side for the shared job runtime. Delays become Queues delivery delays (max 12 h). */
export function queueEnqueue(env: Record<string, unknown>): Enqueue {
  return async (queue, name, data, opts = {}) => {
    const msg: QueueMessage = { name, data, ...(opts.jobId ? { jobId: opts.jobId } : {}) };
    await queueOf(env, queue).send(msg, {
      contentType: "json",
      ...(opts.delayMs ? { delaySeconds: Math.min(43_200, Math.ceil(opts.delayMs / 1000)) } : {}),
    });
  };
}

/** Outbox → Queues, the Cloudflare counterpart of the BullMQ publisher. */
export function queuePublisher(env: Record<string, unknown>): OutboxPublisher {
  return {
    publish: async (event: DomainEvent) => {
      const { queue } = routeEvent(event.type);
      await queueOf(env, queue).send(
        { name: event.type, data: event, jobId: event.dedupeKey },
        { contentType: "json" },
      );
    },
  };
}
