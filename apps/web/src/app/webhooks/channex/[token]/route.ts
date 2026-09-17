import { createHash } from "node:crypto";
import { Id } from "@pms/core";
import { asSystem, enqueueOutbox, resolveWebhookToken, storeInboundWebhook } from "@pms/db";
import { timingSafeEqualStrings } from "@pms/runtime";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { publicRoute } from "@/server/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 256 * 1024;

/**
 * Channex webhook receiver (spec 05 §5.5): path token + secret header, size
 * limit, one durable insert with a dedupe key, 200 in under 100 ms. Processing
 * happens in the worker; the payload is a trigger, never truth (HOOK-1..5).
 * Channex redelivers on 5xx only (docs: Webhook Collection › repeat logic), so an
 * authenticated delivery is never refused: an oversized body is kept as its event
 * name alone, which still triggers the pull; a 401/404 is logged as an alert
 * because that delivery is lost until the poll catches up.
 */
export const POST = publicRoute("webhook", async (req, params) => {
  const c = await container();
  const token = String(params.token ?? "");
  const resolved = await resolveWebhookToken(c.db.db, token);
  if (!resolved) {
    c.log.warn({ token: token.slice(0, 6) }, "webhook.unknown_token");
    throw new HttpProblem(404, "not_found", "Unknown webhook");
  }
  const expected = resolved.secretEnc ? await c.crypto.open(resolved.secretEnc) : null;
  const presented = req.headers.get("x-channex-webhook-secret") ?? "";
  if (expected && !timingSafeEqualStrings(expected, presented)) {
    c.log.warn({ propertyId: resolved.propertyId }, "webhook.bad_secret");
    throw new HttpProblem(401, "unauthenticated", "Bad webhook secret");
  }
  const text = await req.text();
  const bytes = Buffer.byteLength(text, "utf8");
  let body: Record<string, unknown>;
  if (bytes > MAX_BYTES) {
    // the event name from the head of the body; the payload itself is not stored (HOOK-3: it is
    // a trigger, the worker pulls the truth)
    body = { event: eventNameOf(text), truncated: true, bytes };
    c.log.warn({ propertyId: resolved.propertyId, bytes, event: body.event }, "webhook.oversize");
  } else {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new HttpProblem(400, "bad_request", "Webhook body is not JSON");
    }
  }
  const event = typeof body.event === "string" ? body.event : "unknown";
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  const entity = String(
    payload.revision_id ?? payload.booking_id ?? payload.id ?? payload.rate_plan_id ?? "",
  );
  const dedupeKey = createHash("sha256")
    .update(`${event}|${resolved.propertyId}|${entity}|${String(body.timestamp ?? "")}`)
    .digest("hex");
  const stored = await asSystem(c.db.db, resolved.orgId, async (tx) => {
    const r = await storeInboundWebhook(tx, {
      orgId: resolved.orgId,
      propertyId: resolved.propertyId,
      event,
      payload: body,
      dedupeKey,
    });
    if (r.fresh) {
      await enqueueOutbox(tx, {
        type: "webhook.received",
        orgId: resolved.orgId as Id,
        aggregate: { kind: "property", id: resolved.propertyId as Id },
        payload: { webhookId: r.id, propertyId: resolved.propertyId, event },
        occurredAt: new Date().toISOString(),
        dedupeKey: `webhook.received:${dedupeKey}`,
      });
    }
    return r;
  });
  return Response.json({ ok: true, duplicate: !stored.fresh });
});

/** `"event":"ari"` from a body too large to parse, else `unknown`. */
function eventNameOf(text: string): string {
  const m = /"event"\s*:\s*"([a-z_]+)"/.exec(text.slice(0, MAX_BYTES));
  return m?.[1] ?? "unknown";
}
