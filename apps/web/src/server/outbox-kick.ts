import { after } from "next/server";
import { queuePublisher } from "@pms/cloudflare";
import { drainOutbox } from "@pms/db";
import { cfContext } from "./cf-context";
import { container } from "./container";
import { testHooksEnabled } from "./test-hooks";

/**
 * Without a polling publisher process next to the web app, every request that
 * may have written an event asks for a drain after its transaction committed
 * (ADR-0008). On Cloudflare the request drains the outbox itself into the Queue
 * bindings through `waitUntil`; on any other host (Vercel, a container without
 * apps/worker) it pokes the jobs Worker's drain endpoint after the response.
 * The jobs worker's minute tick is the safety net either way; SKIP LOCKED makes
 * the overlap harmless. A no-op with test hooks on, where the drain hook
 * consumes the outbox in-process.
 */
export async function kickOutbox(): Promise<void> {
  if (testHooksEnabled()) return;
  const cf = cfContext();
  try {
    if (cf) {
      const c = await container();
      cf.ctx.waitUntil(
        drainOutbox(c.db.db, queuePublisher(cf.env)).catch((e: unknown) =>
          c.log.error({ err: e instanceof Error ? e.message : String(e) }, "outbox.kick.failed"),
        ),
      );
      return;
    }
    const url = process.env.OUTBOX_KICK_URL;
    const secret = process.env.OUTBOX_KICK_SECRET;
    if (!url || !secret) return;
    after(async () => {
      await fetch(url, { method: "POST", headers: { "x-outbox-secret": secret } }).catch(
        () => undefined,
      );
    });
  } catch {
    /* never fail a request over the kick; the worker tick drains later */
  }
}
