import { asSystem, cellStatesSince } from "@pms/db";
import { realtimeChannel } from "@pms/jobs";
import { container } from "./container";

const POLL_MS = 2000;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

/**
 * Server-sent events for cell sync state (CAL-3). The permission check happened
 * at open; each tick reads within its own system transaction for the org. A
 * Redis message from the worker triggers an immediate tick; without Redis the
 * 2 s poll alone keeps the grid live.
 */
export async function ariEventStream(
  orgId: string,
  propertyIds: string[],
  signal: AbortSignal,
): Promise<Response> {
  const c = await container();
  let since = new Date().toISOString();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let closed = false;
      const tick = async () => {
        if (closed) return;
        try {
          const changes = await asSystem(c.db.db, orgId, (tx) =>
            cellStatesSince(tx, propertyIds, since),
          );
          if (changes.length > 0) {
            since = changes.reduce((m, ch) => (ch.updatedAt > m ? ch.updatedAt : m), since);
            send("cells", changes);
          } else send("ping", { at: new Date().toISOString() });
        } catch (e) {
          send("error", { message: e instanceof Error ? e.message : String(e) });
        }
      };
      const timer = setInterval(() => void tick(), POLL_MS);
      let sub: import("ioredis").Redis | null = null;
      if (c.redis) {
        sub = c.redis.duplicate();
        try {
          await sub.subscribe(...propertyIds.map((p) => realtimeChannel(orgId, p, "ari")));
          sub.on("message", () => void tick());
        } catch {
          sub = null;
        }
      }
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(lifetime);
        void sub?.quit().catch(() => undefined);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const lifetime = setTimeout(close, MAX_LIFETIME_MS);
      signal.addEventListener("abort", close);
      send("hello", { propertyIds, since });
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
