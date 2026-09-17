"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Id, LiveFeedResolution } from "@pms/core";
import { enqueueOutbox, type BookingRequestRow } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { HttpProblem } from "@/server/errors";
import { messaging } from "@/server/inbox";

export const listRequests = withPermission<
  [{ state?: "open" | "all"; propertyId?: string | null }],
  { rows: BookingRequestRow[]; properties: Array<{ id: string; title: string }> }
>("booking:read", { scope: "organization", audit: false }, async (ctx, f) => {
  const repo = await messaging(ctx);
  return {
    rows: await repo.listRequests({
      state: f.state ?? "open",
      ...(f.propertyId ? { propertyId: f.propertyId } : {}),
    }),
    properties: await repo.propertyIds(),
  };
});

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("preapproval"), blockInstantBooking: z.boolean() }),
  z.object({ decision: z.literal("special_offer"), totalPrice: z.coerce.number().positive() }),
  z.object({ decision: z.literal("accept") }),
  z.object({
    decision: z.literal("decline"),
    reason: z
      .enum([
        "dates_not_available",
        "not_a_good_fit",
        "waiting_for_better_reservation",
        "not_comfortable",
      ])
      .optional(),
    messageToGuest: z.string().max(2000).optional(),
  }),
  z.object({ decision: z.literal("cancel") }),
]);

function toResolution(
  kind: BookingRequestRow["kind"],
  d: z.infer<typeof decisionSchema>,
): LiveFeedResolution {
  if (kind === "inquiry" && d.decision === "preapproval")
    return { kind, type: "preapproval", blockInstantBooking: d.blockInstantBooking };
  if (kind === "inquiry" && d.decision === "special_offer")
    return { kind, type: "special_offer", totalPrice: d.totalPrice };
  if (kind === "reservation_request" && d.decision === "accept") return { kind, accept: true };
  if (kind === "reservation_request" && d.decision === "decline")
    return {
      kind,
      accept: false,
      ...(d.reason ? { reason: d.reason } : {}),
      ...(d.messageToGuest ? { messageToGuest: d.messageToGuest } : {}),
    };
  if (
    kind === "alteration_request" &&
    (d.decision === "accept" || d.decision === "decline" || d.decision === "cancel")
  )
    return { kind, accept: d.decision };
  throw new HttpProblem(422, "unsupported", "That answer does not fit this request");
}

/**
 * Answer an Airbnb inquiry, reservation request or alteration (spec 09 §9.8). The decision is
 * recorded here; the worker carries it to Airbnb (ADR-0007) and the row settles when it lands.
 */
export const resolveRequestAction = withPermission<[FormData], void>(
  "booking:modify",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "booking_request", id: String(fd.get("requestId")) }),
    redact: ["messageToGuest"],
  },
  async (ctx, fd) => {
    const repo = await messaging(ctx);
    const r = await repo.request(String(fd.get("requestId")));
    if (!r || r.propertyId !== String(fd.get("propertyId")))
      throw new HttpProblem(404, "not_found", "Request not found in this property");
    if (r.state !== "open") throw new HttpProblem(409, "already_decided", "Already answered");
    const d = decisionSchema.parse({
      decision: fd.get("decision"),
      blockInstantBooking: fd.get("blockInstantBooking") === "1",
      totalPrice: fd.get("totalPrice") ?? undefined,
      reason: String(fd.get("reason") ?? "") || undefined,
      messageToGuest: String(fd.get("messageToGuest") ?? "").trim() || undefined,
    });
    const resolution = toResolution(r.kind, d);
    const now = new Date().toISOString();
    await repo.markRequestDeciding(r.id, { resolution, byUserId: ctx.userId, nowIso: now });
    await enqueueOutbox(ctx.tx, {
      type: "request.resolve",
      orgId: ctx.orgId as Id,
      aggregate: { kind: "booking_request", id: r.id as Id },
      payload: { requestId: r.id, propertyId: r.propertyId },
      occurredAt: now,
      dedupeKey: `request.resolve:${r.id}`,
    });
    revalidatePath("/reservations/requests");
    revalidatePath("/inbox");
  },
);
