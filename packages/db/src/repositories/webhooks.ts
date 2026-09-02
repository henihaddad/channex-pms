import { sql } from "drizzle-orm";
import { Id } from "@pms/core";
import { rawRows, type Tx } from "../tenant.js";

/** Persist-first webhook store (HOOK-1, HOOK-2). Returns false when the dedupe key was already seen. */
export async function storeInboundWebhook(
  tx: Tx,
  input: { orgId: string; propertyId: string; event: string; payload: unknown; dedupeKey: string },
): Promise<{ id: string; fresh: boolean }> {
  const id = Id.next();
  const rows = await rawRows<{ id: string }>(
    tx,
    sql`
    insert into inbound_webhook (id, org_id, property_id, event, payload, dedupe_key)
    values (${id}, ${input.orgId}, ${input.propertyId}, ${input.event}, ${JSON.stringify(input.payload)}::jsonb, ${input.dedupeKey})
    on conflict (dedupe_key) do nothing returning id`,
  );
  return rows.length ? { id, fresh: true } : { id: "", fresh: false };
}

export async function markWebhook(
  tx: Tx,
  id: string,
  state: "processed" | "failed" | "dead",
  error?: string,
): Promise<void> {
  await tx.execute(
    sql`update inbound_webhook set state = ${state}, attempts = attempts + 1, last_error = ${error ?? null}, processed_at = case when ${state} = 'processed' then now() else processed_at end where id = ${id}`,
  );
}

/** Resolve the receiver path token to (org, property, secret). Runs without a tenant (the token is the credential). */
export async function resolveWebhookToken(
  executor: { execute(q: ReturnType<typeof sql>): Promise<unknown> },
  token: string,
): Promise<{ orgId: string; propertyId: string; secretEnc: string | null } | null> {
  const rows = await rawRows<{
    org_id: string;
    property_id: string;
    webhook_secret_enc: string | null;
  }>(
    executor,
    sql`select org_id, property_id, webhook_secret_enc from resolve_webhook_token(${token})`,
  );
  const r = rows[0];
  return r ? { orgId: r.org_id, propertyId: r.property_id, secretEnc: r.webhook_secret_enc } : null;
}
