import { ALL_QUEUES, queuePublisher, queueResourceName, type QueueMessage } from "@pms/cloudflare";
import { drainOutbox } from "@pms/db";
import { dueJobs, handleQueueJob } from "@pms/jobs";
import { QUEUES, type QueueName } from "@pms/runtime";
import { runtime, type Env } from "./wiring.js";

export { PropertyLease } from "./lease.js";

const QUEUE_BY_RESOURCE = new Map<string, QueueName>(
  ALL_QUEUES.map((q) => [queueResourceName(q), q]),
);

/** Drain the outbox into Queues until it is empty (bounded so a tick never runs away). */
async function drainAll(env: Env, rounds = 20): Promise<number> {
  const rt = runtime(env);
  const publisher = queuePublisher(env);
  let total = 0;
  for (let i = 0; i < rounds; i++) {
    const n = await drainOutbox(rt.wiring.db, publisher);
    total += n;
    if (n === 0) break;
  }
  return total;
}

export default {
  /** Health only; the product surface is apps/web. */
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health")
      return Response.json({ ok: true, service: "otabridge-jobs", at: new Date().toISOString() });
    return new Response("not found", { status: 404 });
  },

  /** One consumer for every queue: the envelope names the job, the shared runtime runs it. */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const rt = runtime(env);
    const queue = QUEUE_BY_RESOURCE.get(batch.queue);
    if (!queue) {
      rt.log.error({ queue: batch.queue }, "queue.unknown");
      batch.ackAll();
      return;
    }
    for (const msg of batch.messages) {
      const { name, data } = msg.body;
      let delayMs: number | undefined;
      try {
        await handleQueueJob(
          rt.wiring,
          rt.deps,
          queue,
          name,
          data,
          {
            id: msg.body.jobId ?? msg.id,
            delay: async (ms) => {
              delayMs = ms;
            },
          },
          rt.enqueue,
        );
        if (delayMs !== undefined)
          msg.retry({ delaySeconds: Math.max(1, Math.ceil(delayMs / 1000)) });
        else msg.ack();
      } catch (e) {
        rt.log.error(
          { queue, name, attempt: msg.attempts, err: e instanceof Error ? e.message : String(e) },
          "job.failed",
        );
        msg.retry({ delaySeconds: Math.min(600, 5 * 2 ** msg.attempts) });
      }
    }
  },

  /**
   * The minute tick: publish the outbox, then enqueue every scheduled job that
   * is due (spec 04 §4.5 schedule, UTC). Each job runs as its own `system`
   * message so it gets Queues retries and the 15-minute consumer budget.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const rt = runtime(env);
    const at = new Date(event.scheduledTime);
    // keep an isolate of the web app warm at the placement colo: cold starts of the Next bundle cost ~300 ms
    if (typeof env.NEXT_PUBLIC_APP_URL === "string")
      for (const path of ["/api/health", "/login"])
        ctx.waitUntil(
          fetch(`${env.NEXT_PUBLIC_APP_URL}${path}`, {
            headers: { "user-agent": "otabridge-warm" },
          })
            .then((r) => r.arrayBuffer())
            .catch(() => undefined),
        );
    ctx.waitUntil(
      (async () => {
        const published = await drainAll(env);
        const due = dueJobs(at);
        for (const name of due) await rt.enqueue(QUEUES.system, name, { name });
        rt.log.info({ at: at.toISOString(), published, due }, "tick");
      })(),
    );
  },
} satisfies ExportedHandler<Env, QueueMessage>;
