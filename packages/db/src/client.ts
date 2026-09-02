import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema/index.js";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> | PgliteDatabase<Schema>;

export const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

export interface DbHandle {
  db: Db;
  driver: "pg" | "pglite";
  /** Run pending migrations. Only ever called by the explicit migrate job or the test harness. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/** node-postgres pool. The connecting role should be `pms_app` in production. */
export function connectPg(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzlePg(pool, { schema, casing: "snake_case" });
  return {
    db,
    driver: "pg",
    migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => pool.end(),
  };
}

/** In-process Postgres (WASM) for tests and local development without Docker. */
export async function connectPglite(dataDir?: string): Promise<DbHandle> {
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const client = dataDir
    ? new PGlite(dataDir, { extensions: { btree_gist } })
    : new PGlite({ extensions: { btree_gist } });
  await client.waitReady;
  const db = drizzlePglite(client, { schema, casing: "snake_case" });
  return {
    db,
    driver: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}

/** DATABASE_URL when set, otherwise PGlite. */
export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<DbHandle> {
  return env.DATABASE_URL ? connectPg(env.DATABASE_URL) : connectPglite(env.PGLITE_DATA_DIR);
}
