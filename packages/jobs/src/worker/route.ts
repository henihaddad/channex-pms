import { PRIORITY, QUEUES, type QueueName } from "@pms/runtime";

/** Which queue an event type lands on. Unrouted events go to `system` so nothing is silently dropped. */
export function routeEvent(type: string): { queue: QueueName; priority: number } {
  if (type.startsWith("ari.")) return { queue: QUEUES.ariPush, priority: PRIORITY.critical };
  if (type.startsWith("booking."))
    return { queue: QUEUES.bookingProcess, priority: PRIORITY.critical };
  if (type.startsWith("webhook.")) return { queue: QUEUES.webhookIngest, priority: PRIORITY.high };
  if (type.startsWith("message.") || type.startsWith("thread.") || type.startsWith("review."))
    return { queue: QUEUES.messagesSync, priority: PRIORITY.normal };
  if (type.startsWith("notify.")) return { queue: QUEUES.notifyDeliver, priority: PRIORITY.high };
  if (type.startsWith("automation."))
    return { queue: QUEUES.automationRun, priority: PRIORITY.normal };
  return { queue: QUEUES.system, priority: PRIORITY.low };
}
