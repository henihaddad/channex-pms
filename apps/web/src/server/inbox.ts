import { channelCapabilities, Id, type AutomationTrigger } from "@pms/core";
import {
  DrizzleMessagingRepository,
  enqueueOutbox,
  rawRows,
  sql,
  type ThreadDetail,
} from "@pms/db";
import type { ActorCtx } from "./with-permission";
import { container } from "./container";
import { HttpProblem } from "./errors";

export const PROVIDER_LABELS: Record<string, string> = {
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  expedia: "Expedia",
  direct: "Direct",
};
export const providerLabel = (p: string): string => PROVIDER_LABELS[p] ?? p;

export const TRIGGERS: AutomationTrigger[] = [
  "booking_confirmed",
  "before_arrival",
  "access_window",
  "checked_in",
  "mid_stay",
  "checkout_day",
  "after_departure",
  "inquiry_received",
  "message_outside_hours",
  "booking_cancelled",
];

export async function messaging(ctx: ActorCtx): Promise<DrizzleMessagingRepository> {
  const c = await container();
  return new DrizzleMessagingRepository(ctx.tx, ctx.orgId, c.crypto);
}

/** Every thread action names its property in the form; the handler checks the thread really lives there. */
export async function assertThreadInProperty(
  ctx: ActorCtx,
  threadId: string,
  propertyId: string,
): Promise<{
  id: string;
  propertyId: string;
  providerThreadId: string;
  provider: string;
  state: string;
}> {
  const t = await (await messaging(ctx)).thread(threadId);
  if (!t || t.propertyId !== propertyId)
    throw new HttpProblem(404, "not_found", "Thread not found in this property");
  return t;
}

/** The console queues; the worker (or the test drain) delivers. Never a provider call inside the transaction (ADR-0007). */
export async function queueDelivery(ctx: ActorCtx, messageId: string): Promise<void> {
  await enqueueOutbox(ctx.tx, {
    type: "message.deliver",
    orgId: ctx.orgId as Id,
    aggregate: { kind: "message", id: messageId as Id },
    payload: { messageId },
    occurredAt: new Date().toISOString(),
    dedupeKey: `message.deliver:${messageId}`,
  });
}

export async function queueThreadClose(
  ctx: ActorCtx,
  threadId: string,
  reason: "resolved" | "no_reply_needed",
): Promise<void> {
  await enqueueOutbox(ctx.tx, {
    type: "thread.close",
    orgId: ctx.orgId as Id,
    aggregate: { kind: "message_thread", id: threadId as Id },
    payload: { threadId, reason },
    occurredAt: new Date().toISOString(),
    dedupeKey: `thread.close:${threadId}:${reason}:${String(Date.now())}`,
  });
}

export function capabilitiesFor(detail: ThreadDetail) {
  const caps = channelCapabilities(detail.provider);
  // a thread the provider has not opened yet (automation wrote first) cannot be closed there
  const placeholder = detail.providerThreadId.startsWith("booking:");
  return {
    ...caps,
    closeThread: caps.closeThread && !placeholder,
    noReplyNeeded: caps.noReplyNeeded && !placeholder,
  };
}

export async function currentUserName(ctx: ActorCtx): Promise<string> {
  const [u] = await rawRows<{ name: string }>(
    ctx.tx,
    sql`select name from "user" where id = ${ctx.userId}`,
  );
  return u?.name ?? "Staff";
}

export async function currentUserEmail(ctx: ActorCtx): Promise<string | null> {
  const [u] = await rawRows<{ email: string }>(
    ctx.tx,
    sql`select email from "user" where id = ${ctx.userId}`,
  );
  return u?.email ?? null;
}
