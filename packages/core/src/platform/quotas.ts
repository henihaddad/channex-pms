import type { Quotas, UsageSnapshot, WorkKind } from "./types.js";

/** QUOTA-1: connectivity is exempt from every quota. Losing a booking to a quota would be indefensible. */
export const QUOTA_EXEMPT: ReadonlySet<WorkKind> = new Set<WorkKind>([
  "ari.push",
  "booking.ingest",
  "booking.ack",
  "webhook.ingest",
  "reconcile",
]);

export type QuotaDecision =
  { allow: true; warnings: string[] } | { allow: false; reason: string; warnings: string[] };

/** Warnings from 80 % of a limit; throttling only for non-critical work once a limit is exceeded. */
export function quotaCheck(quotas: Quotas, usage: UsageSnapshot, kind: WorkKind): QuotaDecision {
  const warnings: string[] = [];
  const exceeded: string[] = [];
  const check = (name: string, limit: number | null, value: number) => {
    if (limit === null) return;
    if (value > limit) exceeded.push(`${name} ${String(value)}/${String(limit)}`);
    else if (value >= limit * 0.8) warnings.push(`${name} at ${String(value)}/${String(limit)}`);
  };
  check("properties", quotas.properties, usage.properties);
  check("rooms", quotas.rooms, usage.rooms);
  check("users", quotas.users, usage.users);
  check("api requests per minute", quotas.apiRequestsPerMinute, usage.apiRequestsLastMinute);
  check("webhook endpoints", quotas.webhookEndpoints, usage.webhookEndpoints);
  check("storage MB", quotas.storageMb, usage.storageMb);
  if (QUOTA_EXEMPT.has(kind)) return { allow: true, warnings };
  if (exceeded.length === 0) return { allow: true, warnings };
  // api reads keep working under a property/room overage; only the request-rate limit throttles them
  if (kind === "api.read" && !exceeded.some((e) => e.startsWith("api requests")))
    return { allow: true, warnings };
  return { allow: false, reason: `quota exceeded: ${exceeded.join(", ")}`, warnings };
}
