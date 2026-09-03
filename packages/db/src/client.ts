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

/** A request (or job) that may share one connection across its transactions and queries. */
export interface RequestScope {
  /** Identity of the request; connections are cached per key and dropped when it is collected. */
  key: object;
  /** Keeps the runtime alive until the idle connection has been closed (Workers `ctx.waitUntil`). */
  waitUntil?: (p: Promise<unknown>) => void;
}

export interface ConnectPgOptions {
  /**
   * Short-lived connections instead of a shared pool. Cloudflare Workers forbid
   * sharing a socket across requests; behind Hyperdrive the origin pool lives on
   * Cloudflare's side, so opening one is cheap.
   */
  perRequest?: boolean;
  max?: number;
  /**
   * With `perRequest`, the current scope: every transaction and query of the same
   * scope reuses one connection, serialised like the single-connection
   * development database (ADR-0007), and it closes shortly after the last use.
   * Without a scope each transaction opens its own connection.
   */
  scope?: () => RequestScope | undefined;
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
const SCOPE_IDLE_MS = 300;
const SCOPE_WAIT_MS = 10_000;

interface ScopedConnection {
  client: pg.Client;
  /** FIFO lock: the tail of the chain of holders. */
  tail: Promise<void>;
  idle: ReturnType<typeof setTimeout> | undefined;
  finish: () => void;
}

class PerRequestPool extends pg.Pool {
  private readonly scoped = new WeakMap<object, Promise<ScopedConnection>>();

  constructor(
    private readonly connectionString: string,
    private readonly scope: (() => RequestScope | undefined) | undefined,
  ) {
    super({ connectionString, max: 1 });
  }

  private async fresh(): Promise<pg.PoolClient> {
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

  private open(scope: RequestScope): Promise<ScopedConnection> {
    let entry = this.scoped.get(scope.key);
    if (entry) return entry;
    entry = (async () => {
      const client = new pg.Client({ connectionString: this.connectionString });
      await client.connect();
      let finish = () => undefined as void;
      const done = new Promise<void>((r) => {
        finish = r;
      });
      scope.waitUntil?.(done);
      const s: ScopedConnection = { client, tail: Promise.resolve(), idle: undefined, finish };
      client.on("error", () => {
        this.scoped.delete(scope.key);
        finish();
      });
      return s;
    })();
    this.scoped.set(scope.key, entry);
    entry.catch(() => this.scoped.delete(scope.key));
    return entry;
  }

  /** One connection per scope, holders queued; a holder that never comes back falls through to a fresh connection. */
  private async checkout(): Promise<pg.PoolClient> {
    const scope = this.scope?.();
    if (!scope) return this.fresh();
    const s = await this.open(scope);
    if (s.idle) clearTimeout(s.idle);
    s.idle = undefined;
    const previous = s.tail;
    let unlock!: () => void;
    s.tail = new Promise<void>((r) => {
      unlock = r;
    });
    const timedOut = await Promise.race([
      previous.then(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), SCOPE_WAIT_MS)),
    ]);
    if (timedOut) {
      unlock();
      console.warn("db: request connection held too long; opening a separate one");
      return this.fresh();
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      unlock();
      if (s.idle) clearTimeout(s.idle);
      s.idle = setTimeout(() => {
        this.scoped.delete(scope.key);
        void s.client
          .end()
          .catch(() => undefined)
          .finally(() => s.finish());
      }, SCOPE_IDLE_MS);
    };
    return Object.assign(s.client, { release });
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
    ? new PerRequestPool(connectionString, opts.scope)
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
export async function connect(
  env: NodeJS.ProcessEnv = process.env,
  opts: Pick<ConnectPgOptions, "scope"> = {},
): Promise<DbHandle> {
  if (env.DATABASE_URL)
    return connectPg(env.DATABASE_URL, {
      perRequest: env.DATABASE_PER_REQUEST === "1",
      ...(opts.scope ? { scope: opts.scope } : {}),
    });
  return connectPglite(env.PGLITE_DATA_DIR);
}
