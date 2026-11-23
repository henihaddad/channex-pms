import { ALL_QUEUES, queuePublisher, queueResourceName, type QueueMessage } from "@pms/cloudflare";
import { drainOutbox } from "@pms/db";
import { dueJobs, handleQueueJob } from "@pms/jobs";
import { QUEUES, type QueueName } from "@pms/runtime";
import { runtime, type Env } from "./wiring.js";

export { PropertyLease } from "./lease.js";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

/** What a job asked for: retry later (rate limited, lease busy) or done. */
interface JobOutcome {
  delayMs?: number;
}

/** Run one queued job with the shared runtime. Throws when the job failed and should be retried. */
async function runJob(
  env: Env,
  queue: QueueName,
  name: string,
  data: unknown,
  id: string,
): Promise<JobOutcome> {
  const rt = runtime(env);
  let delayMs: number | undefined;
  await handleQueueJob(
    rt.wiring,
    rt.deps,
    queue,
    name,
    data,
    {
      id,
      delay: async (ms) => {
        delayMs = ms;
      },
    },
    rt.enqueue,
  );
  return delayMs === undefined ? {} : { delayMs };
}

/** The minute tick's work: publish the outbox, then enqueue every scheduled job that is due. */
async function tick(env: Env, at: Date): Promise<void> {
  const rt = runtime(env);
  const published = await drainAll(env);
  const due = dueJobs(at);
  for (const name of due) await rt.enqueue(QUEUES.system, name, { name });
  rt.log.info({ at: at.toISOString(), published, due }, "tick");
}

/**
 * Placement (`placement.region` = the database's AWS region, us-east-2) moves only `fetch`
 * invocations; cron and queue handlers run wherever Cloudflare starts them, far from Neon. So the
 * queue and cron handlers hand the work to this same Worker's fetch handler through its own
 * service binding: Cloudflare still owns the schedule, delivery and retries, and every database
 * round trip happens a few milliseconds from the database (ADR-0009, ADR-0012).
 */
const INTERNAL = "https://otabridge-jobs.internal";
const INTERNAL_HEADER = "x-otabridge-internal";

function internalSecret(env: Env): string | null {
  const s = env.OUTBOX_KICK_SECRET;
  return typeof s === "string" && s !== "" ? s : null;
}

function placedFetcher(env: Env): Fetcher | null {
  const self = env.SELF as Fetcher | undefined;
  return self && typeof self.fetch === "function" && internalSecret(env) ? self : null;
}

async function callPlaced(env: Env, path: string, body: unknown): Promise<Response> {
  return placedFetcher(env)!.fetch(`${INTERNAL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", [INTERNAL_HEADER]: internalSecret(env)! },
    body: JSON.stringify(body),
  });
}

export default {
  /**
   * Health; the drain endpoint a web app hosted elsewhere pokes after a write (ADR-0009); and the
   * internal job and tick endpoints the queue and cron handlers call so the work runs placed.
   */
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health")
      return Response.json({
        ok: true,
        service: "otabridge-jobs",
        at: new Date().toISOString(),
        // where this invocation ran: "remote-<colo>" when placement moved it near the database
        placement: req.headers.get("cf-placement"),
        colo: (req as Request & { cf?: { colo?: string } }).cf?.colo ?? null,
      });
    if (url.pathname === "/outbox/drain" && req.method === "POST") {
      const expected = env.OUTBOX_KICK_SECRET;
      if (
        typeof expected !== "string" ||
        expected === "" ||
        !timingSafeEqual(req.headers.get("x-outbox-secret") ?? "", expected)
      )
        return new Response("forbidden", { status: 403 });
      ctx.waitUntil(drainAll(env).catch(() => undefined));
      return Response.json({ ok: true });
    }
    if (url.pathname.startsWith("/internal/") && req.method === "POST") {
      const expected = internalSecret(env);
      if (!expected || !timingSafeEqual(req.headers.get(INTERNAL_HEADER) ?? "", expected))
        return new Response("forbidden", { status: 403 });
      if (url.pathname === "/internal/job") {
        const j = await req.json<{ queue: QueueName; name: string; data: unknown; id: string }>();
        try {
          return Response.json(await runJob(env, j.queue, j.name, j.data, j.id));
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      }
      if (url.pathname === "/internal/tick") {
        const { at } = await req.json<{ at: string }>();
        await tick(env, new Date(at));
        return Response.json({ ok: true });
      }
    }
    return new Response("not found", { status: 404 });
  },

  /** One consumer for every queue: the envelope names the job, the placed fetch handler runs it. */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const rt = runtime(env);
    const queue = QUEUE_BY_RESOURCE.get(batch.queue);
    if (!queue) {
      rt.log.error({ queue: batch.queue }, "queue.unknown");
      batch.ackAll();
      return;
    }
    const placed = placedFetcher(env) !== null;
    for (const msg of batch.messages) {
      const { name, data } = msg.body;
      const id = msg.body.jobId ?? msg.id;
      try {
        let outcome: JobOutcome;
        if (placed) {
          const res = await callPlaced(env, "/internal/job", { queue, name, data, id });
          const body = (await res.json().catch(() => ({}))) as JobOutcome & { error?: string };
          if (!res.ok) throw new Error(body.error ?? `job endpoint ${res.status}`);
          outcome = body;
        } else outcome = await runJob(env, queue, name, data, id);
        if (outcome.delayMs !== undefined)
          msg.retry({ delaySeconds: Math.max(1, Math.ceil(outcome.delayMs / 1000)) });
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
   * The minute tick: publish the outbox, then enqueue every scheduled job that is due (spec 04
   * §4.5 schedule, UTC). Each job runs as its own `system` message so it gets Queues retries and
   * the 15-minute consumer budget. The tick itself runs placed, through the fetch handler.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const at = new Date(event.scheduledTime);
    // keep an isolate of the web app's Cloudflare copy warm: cold starts of the Next bundle cost ~300 ms
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
      placedFetcher(env)
        ? callPlaced(env, "/internal/tick", { at: at.toISOString() }).then(async (r) => {
            if (!r.ok) throw new Error(`tick endpoint ${r.status}`);
            await r.arrayBuffer();
          })
        : tick(env, at),
    );
  },
} satisfies ExportedHandler<Env, QueueMessage>;
