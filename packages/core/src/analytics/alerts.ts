/** Spec 11 §11.4: threshold and anomaly rules, pure; the job supplies the numbers and applies ALRT-1 rate limits. */
export type AlertType =
  | "low_occupancy"
  | "pickup_behind_stly"
  | "cancellation_spike"
  | "zero_booking_channel"
  | "sync_degraded"
  | "unacked_bookings"
  | "sla_breaches"
  | "review_score_drop"
  | "statement_mismatch";

export interface AlertCandidate {
  type: AlertType;
  /** The property the alert is about, when there is one (the FK on the alert row). */
  propertyId: string | null;
  /** Stable key per subject so the same condition is raised once per day (ALRT-1). */
  key: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  link: string;
}

export const ALERT_DEFAULTS = {
  lowOccupancyBps: 4000,
  lowOccupancyDaysOut: 7,
  zeroBookingDays: 14,
  cancellationSpikeFactor: 2,
  slaBreaches: 3,
  reviewDropPoints: 1,
};

export function lowOccupancy(i: {
  propertyId: string;
  propertyTitle: string;
  date: string;
  occupancyBps: number | null;
  daysOut: number;
  thresholdBps?: number;
}): AlertCandidate | null {
  const threshold = i.thresholdBps ?? ALERT_DEFAULTS.lowOccupancyBps;
  if (
    i.occupancyBps === null ||
    i.daysOut > ALERT_DEFAULTS.lowOccupancyDaysOut ||
    i.daysOut < 0 ||
    i.occupancyBps >= threshold
  )
    return null;
  return {
    type: "low_occupancy",
    propertyId: i.propertyId,
    key: `${i.propertyId}:${i.date}`,
    severity: "warning",
    title: `${i.propertyTitle}: ${i.date} at ${String(Math.round(i.occupancyBps / 100))}%, ${String(i.daysOut)} days out`,
    detail: `Occupancy below ${String(threshold / 100)}% for a date within ${String(ALERT_DEFAULTS.lowOccupancyDaysOut)} days. Consider a rate or restriction change.`,
    link: `/calendar?property=${i.propertyId}&date=${i.date}`,
  };
}

export function zeroBookingChannel(i: {
  connectionId: string;
  propertyId: string;
  propertyTitle: string;
  channel: string;
  lastBookingAt: string | null;
  activeSince: string;
  now: string;
  days?: number;
}): AlertCandidate | null {
  const days = i.days ?? ALERT_DEFAULTS.zeroBookingDays;
  const since = i.lastBookingAt ?? i.activeSince;
  const silentDays = Math.floor((Date.parse(i.now) - Date.parse(since)) / 86_400_000);
  if (i.lastBookingAt === null || silentDays < days) return null;
  return {
    type: "zero_booking_channel",
    propertyId: i.propertyId,
    key: i.connectionId,
    severity: "critical",
    title: `${i.propertyTitle}: no ${i.channel} booking for ${String(silentDays)} days`,
    detail:
      "This channel produced bookings before and has gone quiet: usually a silent mapping or connectivity failure.",
    link: `/channels/${i.connectionId}`,
  };
}

export function cancellationSpike(i: {
  propertyId: string;
  propertyTitle: string;
  channel: string;
  recentRateBps: number | null;
  baselineRateBps: number | null;
  recentBookings: number;
}): AlertCandidate | null {
  if (i.recentRateBps === null || i.baselineRateBps === null || i.recentBookings < 5) return null;
  if (i.recentRateBps < Math.max(1000, i.baselineRateBps * ALERT_DEFAULTS.cancellationSpikeFactor))
    return null;
  return {
    type: "cancellation_spike",
    propertyId: i.propertyId,
    key: `${i.propertyId}:${i.channel}`,
    severity: "warning",
    title: `${i.propertyTitle}: ${i.channel} cancellations at ${String(Math.round(i.recentRateBps / 100))}% (baseline ${String(Math.round(i.baselineRateBps / 100))}%)`,
    detail:
      "Cancellations over the last 30 days are at least twice the 12-month baseline. Check the non-refundable mix and rate parity.",
    link: `/reservations?view=cancelled_this_week`,
  };
}

export function syncDegraded(i: {
  propertyId: string;
  propertyTitle: string;
  failed: number;
  conflicted: number;
  pending: number;
}): AlertCandidate | null {
  if (i.failed + i.conflicted === 0 && i.pending < 500) return null;
  return {
    type: "sync_degraded",
    propertyId: i.propertyId,
    key: i.propertyId,
    severity: i.failed > 0 ? "critical" : "warning",
    title: `${i.propertyTitle}: ${String(i.failed)} failed, ${String(i.conflicted)} drifted, ${String(i.pending)} pending cells`,
    detail:
      "Rates or availability are not what the channels show. Open Sync Health and force a resync if needed.",
    link: `/sync-health`,
  };
}

export function unackedBookings(i: {
  orgId: string;
  count: number;
  oldestMinutes: number;
}): AlertCandidate | null {
  if (i.count === 0 || i.oldestMinutes < 15) return null;
  return {
    type: "unacked_bookings",
    propertyId: null,
    key: i.orgId,
    severity: "critical",
    title: `${String(i.count)} booking revision(s) not acknowledged for ${String(i.oldestMinutes)} min`,
    detail: "Channex re-sends until we acknowledge; the worker's ack sweep may be down.",
    link: `/sync-health`,
  };
}

export function slaBreaches(i: { orgId: string; breaching: number }): AlertCandidate | null {
  if (i.breaching < ALERT_DEFAULTS.slaBreaches) return null;
  return {
    type: "sla_breaches",
    propertyId: null,
    key: i.orgId,
    severity: "warning",
    title: `${String(i.breaching)} guest conversations past their first-response SLA`,
    detail: "Booking.com scores response time; Airbnb inquiries expire.",
    link: `/inbox?view=breaching_sla`,
  };
}

export function reviewScoreDrop(i: {
  propertyId: string;
  propertyTitle: string;
  recentAvg: number | null;
  baselineAvg: number | null;
}): AlertCandidate | null {
  if (
    i.recentAvg === null ||
    i.baselineAvg === null ||
    i.baselineAvg - i.recentAvg < ALERT_DEFAULTS.reviewDropPoints
  )
    return null;
  return {
    type: "review_score_drop",
    propertyId: i.propertyId,
    key: i.propertyId,
    severity: "warning",
    title: `${i.propertyTitle}: review score ${i.recentAvg.toFixed(1)} vs ${i.baselineAvg.toFixed(1)} baseline`,
    detail: "The last 30 days of reviews score a full point below the previous year.",
    link: `/reviews?property=${i.propertyId}`,
  };
}

export function statementMismatch(i: {
  statementId: string;
  propertyId: string;
  propertyTitle: string;
  period: string;
  statementMinor: number;
  reportMinor: number;
}): AlertCandidate | null {
  if (i.statementMinor === i.reportMinor) return null;
  return {
    type: "statement_mismatch",
    propertyId: i.propertyId,
    key: i.statementId,
    severity: "critical",
    title: `${i.propertyTitle} ${i.period}: statement revenue ${String(i.statementMinor)} ≠ report ${String(i.reportMinor)}`,
    detail:
      "The sum of statement booking-revenue lines must equal the revenue report on the same basis (spec 11 §11.3).",
    link: `/owners/statements/${i.statementId}`,
  };
}

/** ALRT-1: an alert type whose action rate is poor is flagged for tuning rather than silently kept. */
export function noisyTypes(
  stats: ReadonlyArray<{ type: AlertType; raised: number; actioned: number }>,
): AlertType[] {
  return stats.filter((s) => s.raised >= 10 && s.actioned / s.raised < 0.2).map((s) => s.type);
}
