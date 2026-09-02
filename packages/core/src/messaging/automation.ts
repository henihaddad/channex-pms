import { localToInstant } from "../operations/routing.js";
import type { AutomationRule, GuardContext } from "./types.js";

export const DEFAULT_LIMITS = { perDay: 1, perStay: 4 };

export type GuardDecision = { allow: true; sendAt: string } | { allow: false; reason: string };

const localHM = (iso: string, tz: string): number => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  return (
    Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 +
    Number(p.find((x) => x.type === "minute")?.value ?? 0)
  );
};
const localDate = (iso: string, tz: string): string => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
};
const hm = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Inside quiet hours (property-local, may wrap midnight)? */
export function inQuietHours(
  nowIso: string,
  tz: string,
  quiet: { from: string; to: string },
): boolean {
  const cur = localHM(nowIso, tz);
  const from = hm(quiet.from);
  const to = hm(quiet.to);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

/** AUTO-1: the next instant outside quiet hours, in the property's zone. */
export function nextAllowed(
  nowIso: string,
  tz: string,
  quiet?: { from: string; to: string },
): string {
  if (!quiet || !inQuietHours(nowIso, tz, quiet)) return nowIso;
  const today = localDate(nowIso, tz);
  let at = localToInstant(today, quiet.to, tz);
  if (at <= Date.parse(nowIso)) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    at = localToInstant(d.toISOString().slice(0, 10), quiet.to, tz);
  }
  return new Date(at).toISOString();
}

/**
 * Every automated send passes here (AUTO-1..3, AUTO-6, access window). Pure:
 * the job supplies the counts, the thread state and the credential window.
 */
export function guardAutomation(ctx: GuardContext): GuardDecision {
  const limits = ctx.limits ?? DEFAULT_LIMITS;
  if (!ctx.rule.enabled) return { allow: false, reason: "rule disabled" };
  if (ctx.propertyKillSwitch) return { allow: false, reason: "property kill switch (AUTO-6)" };
  if (ctx.guestRepliedSinceLastAutomation && !ctx.humanClosedLoop)
    return { allow: false, reason: "guest replied; handed over to a human (AUTO-3)" };
  if (ctx.sentTodayToGuest >= limits.perDay)
    return { allow: false, reason: `daily limit ${String(limits.perDay)} reached (AUTO-2)` };
  if (ctx.sentDuringStayToGuest >= limits.perStay)
    return { allow: false, reason: `stay limit ${String(limits.perStay)} reached (AUTO-2)` };
  if (ctx.rule.trigger === "access_window") {
    if (!ctx.accessValidFrom) return { allow: false, reason: "no access credential yet" };
    const windowOpens = Date.parse(ctx.accessValidFrom) - 24 * 3_600_000;
    if (Date.parse(ctx.nowIso) < windowOpens)
      return { allow: false, reason: "before the access window" };
  }
  return { allow: true, sendAt: nextAllowed(ctx.nowIso, ctx.timezone, ctx.rule.quietHours) };
}

export interface BookingForAutomation {
  bookingId: string;
  propertyId: string;
  provider: string;
  arrivalDate: string;
  departureDate: string;
  status: "new" | "modified" | "cancelled";
  timezone: string;
  checkedInAt?: string | null;
}

/** When a rule fires for a booking: the local instant of its anchor, or null when the trigger is event-driven. */
export function scheduledAt(rule: AutomationRule, b: BookingForAutomation): string | null {
  const time = rule.atLocalTime ?? "10:00";
  const shift = (iso: string, days: number): string => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  switch (rule.trigger) {
    case "before_arrival":
      return new Date(
        localToInstant(shift(b.arrivalDate, -Math.abs(rule.offsetDays ?? 1)), time, b.timezone),
      ).toISOString();
    case "checkout_day":
      return new Date(
        localToInstant(b.departureDate, rule.atLocalTime ?? "08:00", b.timezone),
      ).toISOString();
    case "after_departure":
      return new Date(
        localToInstant(shift(b.departureDate, rule.offsetDays ?? 1), time, b.timezone),
      ).toISOString();
    case "mid_stay": {
      const nights = Math.round(
        (Date.parse(b.departureDate) - Date.parse(b.arrivalDate)) / 86_400_000,
      );
      if (nights < 3) return null;
      return new Date(
        localToInstant(shift(b.arrivalDate, Math.floor(nights / 2)), time, b.timezone),
      ).toISOString();
    }
    default:
      return null;
  }
}

export function ruleApplies(rule: AutomationRule, b: BookingForAutomation): boolean {
  const c = rule.conditions ?? {};
  if (
    c.providers?.length &&
    !c.providers.map((p) => p.toLowerCase()).includes(b.provider.toLowerCase())
  )
    return false;
  if (c.propertyIds?.length && !c.propertyIds.includes(b.propertyId)) return false;
  const nights = Math.round((Date.parse(b.departureDate) - Date.parse(b.arrivalDate)) / 86_400_000);
  if (c.minNights !== undefined && nights < c.minNights) return false;
  if (c.maxNights !== undefined && nights > c.maxNights) return false;
  if (rule.trigger === "booking_cancelled") return b.status === "cancelled";
  return b.status !== "cancelled";
}
