import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> | PgliteDatabase<Schema>;

/** Resolved lazily: Workers bundles have no filesystem and never migrate. */
export async function migrationsFolder(): Promise<string> {
  const path = await import("node:path");
  const url = await import("node:url");
  return path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../migrations");
}

export interface DbHandle {
  db: Db;
  driver: "pg" | "pglite";
  /** Run pending migrations. Only ever called by the explicit migrate job or the test harness. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectPgOptions {
  /**
   * One short-lived connection per query or transaction instead of a shared
   * pool. Cloudflare Workers forbid sharing a socket across requests; behind
   * Hyperdrive the origin pool lives on Cloudflare's side, so this is cheap.
   */
  perRequest?: boolean;
  max?: number;
}

type ConnectCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: Error | boolean) => void,
) => void;

/**
 * A `pg.Pool` whose every checkout is a fresh `pg.Client` closed on release.
 * Subclassing keeps drizzle's `instanceof Pool` transaction path (connect →
 * begin … commit → release) working unchanged.
 */
class PerRequestPool extends pg.Pool {
  constructor(private readonly connectionString: string) {
    super({ connectionString, max: 1 });
  }

  private async checkout(): Promise<pg.PoolClient> {
    const client = new pg.Client({ connectionString: this.connectionString });
    await client.connect();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      void client.end().catch(() => undefined);
    };
    return Object.assign(client, { release });
  }

  // pg's overloads are callback-or-promise. `Pool.query` funnels through `connect`, so overriding it is enough.
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(cb?: ConnectCallback): Promise<pg.PoolClient> | void {
    const p = this.checkout();
    if (!cb) return p;
    p.then(
      (c) => cb(undefined, c, () => c.release()),
      (e: unknown) => cb(e as Error, undefined, () => undefined),
    );
  }

  override end(): Promise<void> {
    return Promise.resolve();
  }
}

/** node-postgres pool. The connecting role should be `pms_app` in production. */
export function connectPg(connectionString: string, opts: ConnectPgOptions = {}): DbHandle {
  const pool = opts.perRequest
    ? new PerRequestPool(connectionString)
    : new pg.Pool({ connectionString, max: opts.max ?? 10 });
  const db = drizzlePg(pool, { schema, casing: "snake_case" });
  return {
    db,
    driver: "pg",
    migrate: async () => migratePg(db, { migrationsFolder: await migrationsFolder() }),
    close: () => pool.end(),
  };
}

/** In-process Postgres (WASM) for tests and local development without Docker. Loaded on demand so Workers bundles never carry it. */
export async function connectPglite(dataDir?: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = dataDir
    ? new PGlite(dataDir, { extensions: { btree_gist } })
    : new PGlite({ extensions: { btree_gist } });
  await client.waitReady;
  const db = drizzle(client, { schema, casing: "snake_case" });
  return {
    db,
    driver: "pglite",
    migrate: async () => migrate(db, { migrationsFolder: await migrationsFolder() }),
    close: () => client.close(),
  };
}

/** DATABASE_URL when set (per-request connections when DATABASE_PER_REQUEST=1, as on Workers), otherwise PGlite. */
export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<DbHandle> {
  if (env.DATABASE_URL)
    return connectPg(env.DATABASE_URL, { perRequest: env.DATABASE_PER_REQUEST === "1" });
  return connectPglite(env.PGLITE_DATA_DIR);
}
