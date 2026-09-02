import { connectPg, connectPglite, type DbHandle } from "../client.js";

/**
 * Test database: DATABASE_URL (CI service container) or in-process PGlite.
 * Every call migrates from scratch, so tests never share state across files.
 */
export async function createTestDb(): Promise<DbHandle> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const handle = url ? connectPg(url) : await connectPglite();
  if (url) {
    // fresh schema per run on a real server
    await handle.db.execute(
      "drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;",
    );
  }
  await handle.migrate();
  return handle;
}
