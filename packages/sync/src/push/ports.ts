export {
  cellKey,
  type AriCellStore,
  type CellOutcome,
  type CellRef,
  type PendingAri,
} from "@pms/core";

/**
 * Token bucket that learns from 429s (spec 05 §5.4.4). The key is whatever the provider
 * limits on: for Channex, `<property>:<availability|restrictions>` (docs: Rate Limits).
 */
export interface RateLimiter {
  /** Resolves when a token is available. */
  acquire(key: string): Promise<void>;
  reportThrottle(key: string, retryAfterMs?: number): void;
  reportSuccess(key: string): void;
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
