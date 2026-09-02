import { randomBytes } from "node:crypto";
import pg from "pg";
import { connectPg, connectPglite, type DbHandle } from "../client.js";

/**
 * Test database: DATABASE_URL (CI service container) or in-process PGlite.
 * On a real server every suite gets its own database (created here, dropped on
 * close) so packages running in parallel under turbo never share tables or the
 * drizzle migration schema. Every handle migrates from scratch.
 */
export async function createTestDb(): Promise<DbHandle> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    const handle = await connectPglite();
    await handle.migrate();
    return handle;
  }
  const name = `pms_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database "${name}"`);
  await admin.end();
  const target = new URL(url);
  target.pathname = `/${name}`;
  const inner = connectPg(target.toString());
  await inner.migrate();
  return {
    ...inner,
    close: async () => {
      await inner.close();
      const cleanup = new pg.Client({ connectionString: url });
      await cleanup.connect();
      await cleanup.query(`drop database if exists "${name}" with (force)`).catch(() => undefined);
      await cleanup.end();
    },
  };
}
