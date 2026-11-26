import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { connectPg } from "./client.js";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * ADR-0008/0013: on Workers a request shares one connection, its transactions queued. A holder
 * that waited in the queue must keep the connection past the idle close the holder before it
 * armed on release (2026-11-26: /book's parallel per-organization searches died with "Client was
 * closed and is not queryable" once a queued transaction ran longer than the idle window).
 */
describe.skipIf(!url)("per-request connection", () => {
  it("keeps the shared connection open for a queued transaction longer than the idle window", async () => {
    const key = {};
    const handle = connectPg(url!, { perRequest: true, scope: () => ({ key }) });
    const slow = () =>
      handle.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_sleep(0.5)`);
        const r = await tx.execute(sql`select 1 as one`);
        return (r.rows[0] as { one: number }).one;
      });
    await expect(Promise.all([slow(), slow(), slow()])).resolves.toEqual([1, 1, 1]);
    await handle.close();
  });
});
