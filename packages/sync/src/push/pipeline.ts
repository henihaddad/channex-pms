import {
  ProviderError,
  ThrottleError,
  TransientError,
  ValidationError,
  type AvailabilityEntry,
  type BatchLimits,
  type CallMeta,
  type Clock,
  type ConnectivityProvider,
  type PushResult,
  type RestrictionEntry,
  type RestrictionValues,
  DEFAULT_BATCH_LIMITS,
} from "@pms/core";
import { buildAvailabilityBatch, buildRestrictionBatch } from "../batch/build.js";
import { expandDates } from "../batch/dates.js";
import { diffAri, stateFromCells, type AriState } from "../batch/apply.js";
import type { AriCellStore, CellOutcome, CellRef } from "@pms/core";
import { RetryLater, type CircuitBreaker, type RateLimiter } from "./ports.js";

export interface PushContext {
  orgId: string;
  propertyId: string;
  provider: ConnectivityProvider;
  store: AriCellStore;
  limiter: RateLimiter;
  breaker: CircuitBreaker;
  clock: Clock;
  meta: CallMeta;
  limits?: BatchLimits;
  /** 0..1: fraction of pushes followed by a read-back verification (spec 05 §5.4.6 #2). */
  verifySampleRate?: number;
  /** Deterministic sampling source; defaults to Math.random. */
  random?: () => number;
  log?: { info(o: object, m: string): void; warn(o: object, m: string): void };
}

export interface PushSummary {
  batches: number;
  accepted: number;
  rejected: number;
  verified: boolean;
  driftCells: number;
  skipped?: "breaker_open" | "nothing_pending";
}

/**
 * Push every pending ARI cell of one property (spec 05 §5.4.1). Availability
 * goes first (money-losing lane), restrictions after. Throttling and outages
 * surface as RetryLater; validation failures mark cells `failed` with the reason
 * and never retry until edited (CX-4: local edits are already persisted as pending).
 */
export async function pushProperty(ctx: PushContext): Promise<PushSummary> {
  const summary: PushSummary = {
    batches: 0,
    accepted: 0,
    rejected: 0,
    verified: false,
    driftCells: 0,
  };
  if (!ctx.breaker.allow(ctx.orgId)) {
    summary.skipped = "breaker_open";
    throw new RetryLater(30_000, "circuit breaker open");
  }
  const pending = await ctx.store.loadPending(ctx.propertyId);
  if (pending.rate.length === 0 && pending.availability.length === 0) {
    summary.skipped = "nothing_pending";
    return summary;
  }
  const limits = ctx.limits ?? DEFAULT_BATCH_LIMITS;
  const versionOf = new Map<string, number>();
  const inFlight: Array<CellRef & { version: number }> = [];
  for (const c of pending.availability) {
    const ref: CellRef = { kind: "availability", roomTypeId: c.roomTypeId, date: c.date };
    versionOf.set(keyOf(ref), c.version);
    inFlight.push({ ...ref, version: c.version });
  }
  for (const c of pending.rate) {
    const ref: CellRef = { kind: "rate", ratePlanId: c.ratePlanId, date: c.date };
    versionOf.set(keyOf(ref), c.version);
    inFlight.push({ ...ref, version: c.version });
  }
  await ctx.store.markInFlight(ctx.propertyId, inFlight);

  const availabilityChunks = buildAvailabilityBatch(pending.availability, limits);
  const restrictionChunks = buildRestrictionBatch(pending.rate, limits);
  let dateFrom = "9999-12-31";
  let dateTo = "0000-01-01";
  for (const c of [...pending.rate, ...pending.availability]) {
    if (c.date < dateFrom) dateFrom = c.date;
    if (c.date > dateTo) dateTo = c.date;
  }

  for (const chunk of availabilityChunks) {
    await run(ctx, "availability", chunk, versionOf, summary, (entries, meta) =>
      ctx.provider.pushAvailability({ propertyId: ctx.propertyId, entries }, meta),
    );
  }
  for (const chunk of restrictionChunks) {
    await run(ctx, "restrictions", chunk, versionOf, summary, (entries, meta) =>
      ctx.provider.pushRatesAndRestrictions({ propertyId: ctx.propertyId, entries }, meta),
    );
  }

  const sample = ctx.verifySampleRate ?? 0.05;
  if (sample > 0 && (ctx.random ?? Math.random)() < sample) {
    summary.verified = true;
    summary.driftCells = await verify(ctx, dateFrom, dateTo);
  }
  return summary;
}

type Entry = AvailabilityEntry | RestrictionEntry;

async function run(
  ctx: PushContext,
  kind: "availability" | "restrictions",
  entries: Entry[],
  versionOf: Map<string, number>,
  summary: PushSummary,
  push: (entries: never, meta: CallMeta) => Promise<PushResult>,
): Promise<void> {
  await ctx.limiter.acquire(ctx.orgId);
  const meta = {
    ...ctx.meta,
    dedupeKey: `${ctx.meta.dedupeKey}:${kind}:${String(summary.batches)}`,
  };
  let result: PushResult;
  try {
    result = await push(entries as never, meta);
  } catch (e) {
    if (e instanceof ThrottleError) {
      ctx.limiter.reportThrottle(ctx.orgId, e.retryAfterMs);
      await revertToPending(ctx, entries, versionOf);
      throw new RetryLater(e.retryAfterMs ?? 1_000, "throttled");
    }
    if (e instanceof TransientError) {
      ctx.breaker.onFailure(ctx.orgId);
      await revertToPending(ctx, entries, versionOf);
      throw new RetryLater(5_000, e.message);
    }
    if (e instanceof ValidationError) {
      // the whole batch was rejected: every cell fails with the reason (no retry until edited)
      await ctx.store.applyOutcomes(
        ctx.propertyId,
        cellsOf(entries, versionOf).map((c) => ({ ...c, status: "failed", reason: e.message })),
      );
      summary.batches += 1;
      summary.rejected += entries.length;
      ctx.breaker.onSuccess(ctx.orgId); // the provider answered; it is not down
      return;
    }
    if (e instanceof ProviderError && e.kind === "auth") {
      await revertToPending(ctx, entries, versionOf);
      throw e; // pause the org queue; a human must reconnect (spec 05 §5.10)
    }
    throw e;
  }
  ctx.breaker.onSuccess(ctx.orgId);
  ctx.limiter.reportSuccess(ctx.orgId);
  summary.batches += 1;
  summary.accepted += result.accepted;
  summary.rejected += result.rejected.length;
  const rejectedByIndex = new Map(result.rejected.map((r) => [r.index, r.reason]));
  const outcomes: CellOutcome[] = [];
  entries.forEach((entry, index) => {
    const reason = rejectedByIndex.get(index);
    for (const c of cellsOf([entry], versionOf))
      outcomes.push(
        reason === undefined ? { ...c, status: "synced" } : { ...c, status: "failed", reason },
      );
  });
  // FIFO: a later entry may cover a cell an earlier one already touched; the last outcome wins
  const last = new Map<string, CellOutcome>();
  for (const o of outcomes) last.set(keyOf(o), o);
  await ctx.store.applyOutcomes(ctx.propertyId, [...last.values()]);
  ctx.log?.info(
    {
      propertyId: ctx.propertyId,
      kind,
      entries: entries.length,
      accepted: result.accepted,
      rejected: result.rejected.length,
    },
    "ari.push.batch",
  );
}

async function revertToPending(
  ctx: PushContext,
  entries: Entry[],
  versionOf: Map<string, number>,
): Promise<void> {
  await ctx.store.applyOutcomes(
    ctx.propertyId,
    cellsOf(entries, versionOf).map((c) => ({ ...c, status: "failed", reason: "retry" })),
  );
}

function cellsOf(
  entries: Entry[],
  versionOf: Map<string, number>,
): Array<CellRef & { version: number }> {
  const out: Array<CellRef & { version: number }> = [];
  for (const e of entries) {
    for (const date of expandDates(e.dateFrom, e.dateTo, e.days)) {
      const ref: CellRef =
        "roomTypeId" in e
          ? { kind: "availability", roomTypeId: e.roomTypeId, date }
          : { kind: "rate", ratePlanId: e.ratePlanId, date };
      const version = versionOf.get(keyOf(ref));
      if (version !== undefined) out.push({ ...ref, version });
    }
  }
  return out;
}

/** Read back and compare (spec 05 §5.4.6): differing cells become `conflicted` and re-enter the pipeline. */
export async function verify(ctx: PushContext, dateFrom: string, dateTo: string): Promise<number> {
  await ctx.limiter.acquire(ctx.orgId);
  const snapshot = await ctx.provider.readAri(
    { propertyId: ctx.propertyId, dateFrom, dateTo },
    { ...ctx.meta, dedupeKey: `${ctx.meta.dedupeKey}:verify` },
  );
  const desired = await ctx.store.loadDesired(ctx.propertyId, dateFrom, dateTo);
  const mirror: AriState = stateFromCells(
    snapshot.restrictions.map((r) => ({
      ratePlanId: r.ratePlanId,
      date: r.date,
      values: stripUndefined<RestrictionValues>({
        rate: r.rate,
        rates: r.rates,
        minStay: r.minStay,
        minStayArrival: r.minStayArrival,
        minStayThrough: r.minStayThrough,
        maxStay: r.maxStay,
        closedToArrival: r.closedToArrival,
        closedToDeparture: r.closedToDeparture,
        stopSell: r.stopSell,
      }),
    })),
    snapshot.availability,
  );
  const desiredState = stateFromCells(desired.rate, desired.availability);
  // only compare cells we own: the provider may hold dates we never wrote
  for (const k of [...mirror.restrictions.keys()])
    if (!desiredState.restrictions.has(k)) mirror.restrictions.delete(k);
  for (const k of [...mirror.availability.keys()])
    if (!desiredState.availability.has(k)) mirror.availability.delete(k);
  const d = diffAri(desiredState, mirror);
  const conflicted: CellRef[] = [
    ...d.restrictions.map((k) => {
      const [ratePlanId, date] = k.split("|") as [string, string];
      return { kind: "rate" as const, ratePlanId, date };
    }),
    ...d.availability.map((k) => {
      const [roomTypeId, date] = k.split("|") as [string, string];
      return { kind: "availability" as const, roomTypeId, date };
    }),
  ];
  if (conflicted.length > 0) {
    await ctx.store.markConflicted(ctx.propertyId, conflicted);
    ctx.log?.warn({ propertyId: ctx.propertyId, cells: conflicted.length }, "ari.drift.detected");
  }
  return conflicted.length;
}

function stripUndefined<T extends object>(o: { [K in keyof T]: T[K] | undefined }): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const keyOf = (c: CellRef): string =>
  c.kind === "rate" ? `rate|${c.ratePlanId}|${c.date}` : `availability|${c.roomTypeId}|${c.date}`;
