import type { Queue } from "bullmq";
import type { DomainEvent } from "@pms/core";
import { drainOutbox, type Db, type OutboxPublisher } from "@pms/db";
import { PRIORITY, QUEUES, type QueueName } from "@pms/runtime";

/** Which queue an event type lands on. Unrouted events go to `system` so nothing is silently dropped. */
export function routeEvent(type: string): { queue: QueueName; priority: number } {
  if (type.startsWith("ari.")) return { queue: QUEUES.ariPush, priority: PRIORITY.critical };
  if (type.startsWith("booking."))
    return { queue: QUEUES.bookingProcess, priority: PRIORITY.critical };
  if (type.startsWith("webhook.")) return { queue: QUEUES.webhookIngest, priority: PRIORITY.high };
  if (type.startsWith("message.") || type.startsWith("thread."))
    return { queue: QUEUES.messagesSync, priority: PRIORITY.normal };
  if (type.startsWith("notify.")) return { queue: QUEUES.notifyDeliver, priority: PRIORITY.high };
  if (type.startsWith("automation."))
    return { queue: QUEUES.automationRun, priority: PRIORITY.normal };
  return { queue: QUEUES.system, priority: PRIORITY.low };
}

export function bullPublisher(queues: Record<QueueName, Queue>): OutboxPublisher {
  return {
    publish: async (event: DomainEvent) => {
      const { queue, priority } = routeEvent(event.type);
      await queues[queue].add(event.type, event, {
        jobId: event.dedupeKey,
        priority,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    },
  };
}

/** Poll loop: drain until empty, then sleep. Returns a stop function. */
export function startOutboxPublisher(
  db: Db,
  publisher: OutboxPublisher,
  opts: { intervalMs: number; onError: (e: unknown) => void },
): () => Promise<void> {
  let running = true;
  let current: Promise<void> = Promise.resolve();
  const tick = async () => {
    while (running) {
      try {
        let n = 0;
        do n = await drainOutbox(db, publisher);
        while (n > 0 && running);
      } catch (e) {
        opts.onError(e);
      }
      await new Promise((r) => setTimeout(r, opts.intervalMs));
    }
  };
  current = tick();
  return async () => {
    running = false;
    await current;
  };
}
