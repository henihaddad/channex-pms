import type { InboxView, SlaTargets, Thread } from "./types.js";
import { DEFAULT_SLA } from "./types.js";

/** First-response deadline from the last inbound message, business-hours aware when given. */
export function firstResponseDue(
  lastInboundIso: string,
  targets: SlaTargets = DEFAULT_SLA,
  businessHours?: { from: string; to: string; timezone: string },
): string {
  let due = Date.parse(lastInboundIso) + targets.firstResponseMinutes * 60_000;
  if (businessHours) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: businessHours.timezone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(due));
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const [fh, fm] = businessHours.from.split(":").map(Number);
    const [th, tm] = businessHours.to.split(":").map(Number);
    const cur = hh * 60 + mm;
    const open = (fh ?? 9) * 60 + (fm ?? 0);
    const close = (th ?? 18) * 60 + (tm ?? 0);
    if (cur >= close)
      due += (24 * 60 - cur + open) * 60_000 + targets.firstResponseMinutes * 60_000;
    else if (cur < open) due += (open - cur) * 60_000;
  }
  return new Date(due).toISOString();
}

export interface SlaState {
  needsReply: boolean;
  dueAt: string | null;
  remainingMinutes: number | null;
  breached: boolean;
}

/** Needs reply = open, last message inbound, no staff reply since (spec 09 §9.1). */
export function slaState(t: Thread, nowIso: string): SlaState {
  const needsReply =
    t.state === "open" &&
    t.lastInboundAt !== null &&
    (t.lastOutboundAt === null || t.lastOutboundAt < t.lastInboundAt);
  if (!needsReply || !t.firstResponseDueAt)
    return { needsReply, dueAt: null, remainingMinutes: null, breached: false };
  const remaining = Math.round((Date.parse(t.firstResponseDueAt) - Date.parse(nowIso)) / 60_000);
  return {
    needsReply,
    dueAt: t.firstResponseDueAt,
    remainingMinutes: remaining,
    breached: remaining < 0,
  };
}

export function matchesView(
  t: Thread,
  view: InboxView,
  ctx: {
    nowIso: string;
    userId: string;
    arrivalWindow?: { from: string; to: string };
    inHouse?: boolean;
    arrivalDate?: string | null;
  },
): boolean {
  const sla = slaState(t, ctx.nowIso);
  const snoozed = t.snoozedUntil !== null && t.snoozedUntil > ctx.nowIso;
  switch (view) {
    case "needs_reply":
      return sla.needsReply && !snoozed;
    case "breaching_sla":
      return (
        sla.needsReply &&
        (sla.breached || (sla.remainingMinutes !== null && sla.remainingMinutes <= 30))
      );
    case "assigned_to_me":
      return t.assigneeId === ctx.userId && t.state === "open";
    case "unassigned":
      return t.assigneeId === null && t.state === "open";
    case "inquiries":
      return t.kind === "inquiry";
    case "arriving":
      return (
        !!ctx.arrivalDate &&
        !!ctx.arrivalWindow &&
        ctx.arrivalDate >= ctx.arrivalWindow.from &&
        ctx.arrivalDate <= ctx.arrivalWindow.to
      );
    case "in_house":
      return ctx.inHouse === true;
    case "snoozed":
      return snoozed;
    case "closed":
      return t.state !== "open";
    case "all":
      return true;
  }
}

/** Median first response in minutes over (inbound, first staff reply) pairs; null with no data. */
export function medianFirstResponseMinutes(
  pairs: ReadonlyArray<{ inboundAt: string; repliedAt: string }>,
): number | null {
  if (pairs.length === 0) return null;
  const xs = pairs
    .map((p) => (Date.parse(p.repliedAt) - Date.parse(p.inboundAt)) / 60_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}
