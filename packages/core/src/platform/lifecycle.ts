import type { TenantEvent, TenantState } from "./types.js";

/** Spec 12 §12.3 state machine. Illegal transitions return null so callers cannot skip a state. */
export function nextTenantState(state: TenantState, event: TenantEvent): TenantState | null {
  switch (state) {
    case "trial":
      if (event === "plan_chosen") return "active";
      if (event === "trial_ended") return "expired";
      return null;
    case "active":
      if (event === "payment_failed") return "past_due";
      if (event === "offboarding_requested") return "offboarding";
      return null;
    case "past_due":
      if (event === "payment_recovered") return "active";
      if (event === "dunning_exhausted") return "suspended";
      if (event === "offboarding_requested") return "offboarding";
      return null;
    case "expired":
      if (event === "plan_chosen") return "active";
      if (event === "offboarding_requested" || event === "retention_expired") return "offboarding";
      return null;
    case "suspended":
      if (event === "reactivated" || event === "payment_recovered") return "active";
      if (event === "offboarding_requested" || event === "retention_expired") return "offboarding";
      return null;
    case "offboarding":
      return null;
  }
}

/**
 * Suspension is degraded, not destroyed (§12.3): sync, ingest and ack keep running for
 * every state that still has data; only the console is closed. Offboarding stops the
 * outbound pushes once the export has been taken.
 */
export function syncRunsIn(state: TenantState): boolean {
  return state !== "offboarding";
}

/** Console access per state; the billing page stays reachable so the tenant can recover. */
export function consoleAccess(state: TenantState): "full" | "billing_only" {
  return state === "suspended" || state === "expired" ? "billing_only" : "full";
}

/** Dunning (§12.5, plan default): retries on days 3, 5 and 7 after the failure, then a 14-day grace period. */
export const DUNNING = { retryDays: [3, 5, 7] as const, graceDays: 14 };

export type DunningStep =
  | { kind: "retry"; attempt: number; dueOn: string }
  | { kind: "grace"; suspendOn: string }
  | { kind: "suspend" }
  | { kind: "none" };

/** What dunning should do today for a payment that failed on `failedOn`, given how many retries already ran. */
export function dunningStep(failedOn: string, retriesDone: number, today: string): DunningStep {
  const plus = (d: string, n: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const lastRetry = DUNNING.retryDays[DUNNING.retryDays.length - 1]!;
  const suspendOn = plus(failedOn, lastRetry + DUNNING.graceDays);
  if (retriesDone < DUNNING.retryDays.length) {
    const dueOn = plus(failedOn, DUNNING.retryDays[retriesDone]!);
    return today >= dueOn ? { kind: "retry", attempt: retriesDone + 1, dueOn } : { kind: "none" };
  }
  if (today >= suspendOn) return { kind: "suspend" };
  return { kind: "grace", suspendOn };
}

export function trialEndsOn(createdAt: string, trialDays: number): string {
  return new Date(Date.parse(createdAt) + trialDays * 86_400_000).toISOString().slice(0, 10);
}
