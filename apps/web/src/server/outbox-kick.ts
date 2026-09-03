import { queuePublisher } from "@pms/cloudflare";
import { drainOutbox } from "@pms/db";
import { cfContext } from "./cf-context";
import { container } from "./container";
import { testHooksEnabled } from "./test-hooks";

/**
 * On Cloudflare the outbox has no polling publisher process, so every request
 * that may have written an event hands the drain to `waitUntil` after its
 * transaction committed (ADR-0008). The jobs worker's minute tick is the safety
 * net; SKIP LOCKED makes the two safe to overlap. A no-op under plain Node and
 * with test hooks on, where the drain hook consumes the outbox in-process.
 */
export async function kickOutbox(): Promise<void> {
  const cf = cfContext();
  if (!cf || testHooksEnabled()) return;
  try {
    const c = await container();
    cf.ctx.waitUntil(
      drainOutbox(c.db.db, queuePublisher(cf.env)).catch((e: unknown) =>
        c.log.error({ err: e instanceof Error ? e.message : String(e) }, "outbox.kick.failed"),
      ),
    );
  } catch {
    /* never fail a request over the kick; the worker tick drains later */
  }
}
