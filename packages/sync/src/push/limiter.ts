import type { Clock } from "@pms/core";
import type { BreakerState, CircuitBreaker, RateLimiter } from "./ports.js";

export interface TokenBucketOptions {
  /** Tokens per second at the base rate. */
  baseRatePerSecond: number;
  burst: number;
  /** Floor for the adaptive rate. */
  minRatePerSecond?: number;
  /** Consecutive successes before the rate steps back up. */
  recoverAfter?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * In-memory adaptive token bucket. Sustained 429s halve the refill rate; a clean
 * window restores it (spec 05 §5.4.4). The Redis variant in apps/worker shares
 * the same contract; this one serves tests, the chaos runner and single-process runs.
 */
export class TokenBucket implements RateLimiter {
  private readonly buckets = new Map<
    string,
    { tokens: number; rate: number; lastMs: number; successes: number }
  >();
  private readonly opts: Required<TokenBucketOptions>;

  constructor(
    private readonly clock: Clock,
    opts: TokenBucketOptions,
  ) {
    this.opts = {
      minRatePerSecond: Math.max(0.1, opts.baseRatePerSecond / 16),
      recoverAfter: 20,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ...opts,
    };
  }

  private bucket(orgId: string) {
    let b = this.buckets.get(orgId);
    if (!b) {
      b = {
        tokens: this.opts.burst,
        rate: this.opts.baseRatePerSecond,
        lastMs: this.clock.now().epochMilliseconds,
        successes: 0,
      };
      this.buckets.set(orgId, b);
    }
    const nowMs = this.clock.now().epochMilliseconds;
    b.tokens = Math.min(this.opts.burst, b.tokens + ((nowMs - b.lastMs) / 1000) * b.rate);
    b.lastMs = nowMs;
    return b;
  }

  async acquire(orgId: string): Promise<void> {
    for (;;) {
      const b = this.bucket(orgId);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - b.tokens) / b.rate) * 1000);
      await this.opts.sleep(waitMs);
    }
  }

  reportThrottle(orgId: string): void {
    const b = this.bucket(orgId);
    b.rate = Math.max(this.opts.minRatePerSecond, b.rate / 2);
    b.tokens = 0;
    b.successes = 0;
  }

  reportSuccess(orgId: string): void {
    const b = this.bucket(orgId);
    b.successes += 1;
    if (b.successes >= this.opts.recoverAfter && b.rate < this.opts.baseRatePerSecond) {
      b.rate = Math.min(this.opts.baseRatePerSecond, b.rate * 2);
      b.successes = 0;
    }
  }

  currentRate(orgId: string): number {
    return this.bucket(orgId).rate;
  }
}

export interface BreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

/** In-memory circuit breaker: open after N consecutive failures, half-open probe after the cooldown. */
export class MemoryCircuitBreaker implements CircuitBreaker {
  private readonly orgs = new Map<
    string,
    { failures: number; openedAtMs: number | null; probing: boolean }
  >();

  constructor(
    private readonly clock: Clock,
    private readonly opts: BreakerOptions = { failureThreshold: 5, cooldownMs: 60_000 },
  ) {}

  private entry(orgId: string) {
    let e = this.orgs.get(orgId);
    if (!e) {
      e = { failures: 0, openedAtMs: null, probing: false };
      this.orgs.set(orgId, e);
    }
    return e;
  }

  state(orgId: string): BreakerState {
    const e = this.entry(orgId);
    if (e.openedAtMs === null) return "closed";
    return this.clock.now().epochMilliseconds - e.openedAtMs >= this.opts.cooldownMs
      ? "half_open"
      : "open";
  }

  allow(orgId: string): boolean {
    const s = this.state(orgId);
    if (s === "closed") return true;
    if (s === "open") return false;
    const e = this.entry(orgId);
    if (e.probing) return false;
    e.probing = true;
    return true;
  }

  onSuccess(orgId: string): void {
    this.orgs.set(orgId, { failures: 0, openedAtMs: null, probing: false });
  }

  onFailure(orgId: string): void {
    const e = this.entry(orgId);
    e.failures += 1;
    e.probing = false;
    if (e.failures >= this.opts.failureThreshold || e.openedAtMs !== null)
      e.openedAtMs = this.clock.now().epochMilliseconds;
  }
}
