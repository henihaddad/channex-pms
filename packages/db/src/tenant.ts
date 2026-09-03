import { sql, type SQL } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { Db, Schema } from "./client.js";

export interface Actor {
  type: "user" | "service_account" | "system" | "guest" | "owner" | "automation";
  id: string;
  impersonatedBy?: string;
}

export interface TenantContext {
  orgId: string;
  actor: Actor;
  requestId?: string;
}

// The transaction type is the same for both drivers at the query-builder level.
export type Tx = PgTransaction<never, Schema, ExtractTablesWithRelations<Schema>>;

/**
 * Open a tenant-scoped transaction (spec 04 §4.6 layer 1 and 2). The RLS policies
 * read `app.org_id`; nothing outside this function may touch a tenant table.
 * The role switch makes RLS bite even when connected as the migration owner.
 */
export async function withTenant<T>(
  db: Db,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // one round trip for the role switch and every setting: on a remote database each statement costs a hop
    await tx.execute(
      sql`select set_config('role', 'pms_app', true), set_config('app.org_id', ${ctx.orgId}, true), set_config('app.actor_id', ${ctx.actor.id}, true), set_config('app.actor_type', ${ctx.actor.type}, true), set_config('app.request_id', ${ctx.requestId ?? ""}, true)`,
    );
    return fn(tx as unknown as Tx);
  });
}

/** Worker-side variant: same isolation, system actor. */
export function asSystem<T>(
  db: Db,
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
  requestId?: string,
): Promise<T> {
  return withTenant(
    db,
    { orgId, actor: { type: "system", id: "worker" }, ...(requestId ? { requestId } : {}) },
    fn,
  );
}

/**
 * Cross-tenant work (identity lookups on global tables, the outbox publisher,
 * migrations). Runs as the connecting role without a tenant setting, so RLS on
 * org tables returns nothing: global tables only.
 */
export function withoutTenant<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as Tx));
}

/** Rows of a raw `execute` result, whichever driver produced it. */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}

/** Raw query returning typed rows. Use inside withTenant/asSystem for tenant tables. */
export async function rawRows<T = Record<string, unknown>>(
  executor: { execute(q: SQL): Promise<unknown> },
  query: SQL,
): Promise<T[]> {
  return rowsOf<T>(await executor.execute(query));
}
