export {
  cellKey,
  type AriCellStore,
  type CellOutcome,
  type CellRef,
  type PendingAri,
} from "@pms/core";

/** Per-organization token bucket that learns from 429s (spec 05 §5.4.4). */
export interface RateLimiter {
  /** Resolves when a token is available. */
  acquire(orgId: string): Promise<void>;
  reportThrottle(orgId: string, retryAfterMs?: number): void;
  reportSuccess(orgId: string): void;
}

export type BreakerState = "closed" | "open" | "half_open";

/** Per-organization circuit breaker (spec 05 §5.4.4). */
export interface CircuitBreaker {
  state(orgId: string): BreakerState;
  /** True when a call may proceed (closed, or half-open probe). */
  allow(orgId: string): boolean;
  onSuccess(orgId: string): void;
  onFailure(orgId: string): void;
}

/** Thrown by the pipeline when the job must be re-run later (throttled, breaker open, transient failure). */
export class RetryLater extends Error {
  constructor(
    readonly delayMs: number,
    readonly reason: string,
  ) {
    super(`retry in ${String(delayMs)}ms: ${reason}`);
    this.name = "RetryLater";
  }
}
