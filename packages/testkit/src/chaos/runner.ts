import {
  FakeClock,
  ackSweep,
  ingestProperty,
  MemoryBookingRepository,
  computeAvailable,
  type BookingRevisionPayload,
  type RevisionDiff,
} from "@pms/core";
import { FakeProvider, type FaultPlan, type Ledger } from "@pms/connectivity";
import {
  MemoryAriStore,
  MemoryCircuitBreaker,
  pushProperty,
  RetryLater,
  TokenBucket,
  verify,
  stateFromCells,
  diffAri,
} from "@pms/sync";
import { mulberry32 } from "@pms/connectivity";

/**
 * Chaos runner (spec 04 §4.11, spec 15 M1): drive the real ingestion service
 * and push pipeline against the FakeProvider under a seeded fault plan, then
 * quiesce and assert the two invariants that matter:
 *   1. no booking lost: every emitted revision is stored and acked, projections match the ledger fold
 *   2. no ARI cell permanently wrong: every desired cell is synced and equals the provider's state
 */
export interface ChaosScenario {
  seed: number;
  faults: FaultPlan["rules"];
  steps: number;
  properties?: number;
}

export interface ChaosReport {
  ok: boolean;
  seed: number;
  steps: number;
  emitted: number;
  acked: number;
  pushes: number;
  retries: number;
  failures: string[];
  ledger: Pick<Ledger, "webhooksDropped"> & { calls: number };
}

interface Op {
  kind:
    "edit_rate" | "edit_availability" | "book" | "modify" | "cancel" | "advance" | "outage_window";
}

const PROPERTY = "prop-chaos";
const ROOM_TYPE = "rt-1";
const RATE_PLAN = "rp-1";
const COUNT_OF_ROOMS = 3;

export async function runChaos(scenario: ChaosScenario): Promise<ChaosReport> {
  const rand = mulberry32(scenario.seed ^ 0x9e3779b9);
  const fake = new FakeProvider({ seed: scenario.seed, rules: scenario.faults });
  const clock = new FakeClock("2026-09-01T00:00:00Z");
  const store = new MemoryAriStore();
  const repo = new MemoryBookingRepository();
  const limiter = new TokenBucket(clock, {
    baseRatePerSecond: 50,
    burst: 20,
    sleep: async (ms) => {
      clock.advance({ milliseconds: ms });
    },
  });
  const breaker = new MemoryCircuitBreaker(clock, { failureThreshold: 3, cooldownMs: 10_000 });
  const report: ChaosReport = {
    ok: true,
    seed: scenario.seed,
    steps: scenario.steps,
    emitted: 0,
    acked: 0,
    pushes: 0,
    retries: 0,
    failures: [],
    ledger: { webhooksDropped: 0, calls: 0 },
  };
  const booked = new Map<string, number>(); // roomType|date → nights booked per the applied projections (model)
  const liveBookings: string[] = [];
  let webhookTriggers = 0;
  fake.webhookSink = async () => {
    webhookTriggers += 1;
  };

  const deps = { provider: fake, repo, clock, orgId: "org-chaos" };
  const meta = () => ({
    dedupeKey: `chaos:${String(clock.now().epochMilliseconds)}`,
    requestId: "chaos",
  });

  const derive = () => {
    // availability derivation from the model's projections (what the worker consumer does from booking_room_day)
    const nights = new Map<string, number>();
    for (const p of repo.projections.values()) {
      if (p.status === "cancelled") continue;
      for (const r of p.rooms)
        for (const d of Object.keys(r.days))
          if (r.roomTypeId)
            nights.set(`${r.roomTypeId}|${d}`, (nights.get(`${r.roomTypeId}|${d}`) ?? 0) + 1);
    }
    for (const [k, n] of nights) {
      const [rt, date] = k.split("|") as [string, string];
      const { available } = computeAvailable({
        countOfRooms: COUNT_OF_ROOMS,
        booked: n,
        outOfOrder: 0,
        blocks: 0,
        keepBack: 0,
      });
      if (booked.get(k) !== n) {
        store.setAvailability(rt, date, available);
        booked.set(k, n);
      }
    }
    for (const k of [...booked.keys()])
      if (!nights.has(k)) {
        const [rt, date] = k.split("|") as [string, string];
        store.setAvailability(rt, date, COUNT_OF_ROOMS);
        booked.delete(k);
      }
  };

  const push = async (): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const s = await pushProperty({
          orgId: "org-chaos",
          propertyId: PROPERTY,
          provider: fake,
          store,
          limiter,
          breaker,
          clock,
          meta: meta(),
          verifySampleRate: 0,
          random: rand,
        });
        report.pushes += s.batches;
        return;
      } catch (e) {
        if (e instanceof RetryLater) {
          report.retries += 1;
          clock.advance({ milliseconds: e.delayMs });
          continue;
        }
        throw e;
      }
    }
  };

  const ingest = async (): Promise<void> => {
    try {
      await ingestProperty(deps, PROPERTY, meta());
    } catch {
      /* transient feed failures: the poll retries a minute later */
    }
  };

  const dateFor = (offset: number) => `2026-10-${String(1 + (offset % 20)).padStart(2, "0")}`;

  for (let i = 0; i < scenario.steps; i++) {
    const roll = rand();
    const op: Op =
      roll < 0.25
        ? { kind: "edit_rate" }
        : roll < 0.4
          ? { kind: "edit_availability" }
          : roll < 0.6
            ? { kind: "book" }
            : roll < 0.7
              ? { kind: "modify" }
              : roll < 0.8
                ? { kind: "cancel" }
                : { kind: "advance" };
    switch (op.kind) {
      case "edit_rate":
        store.setRate(RATE_PLAN, dateFor(Math.floor(rand() * 20)), {
          rate: 5000 + Math.floor(rand() * 10) * 1000,
          minStay: 1 + Math.floor(rand() * 3),
        });
        break;
      case "edit_availability":
        store.setAvailability(
          ROOM_TYPE,
          dateFor(Math.floor(rand() * 20)),
          Math.floor(rand() * (COUNT_OF_ROOMS + 1)),
        );
        break;
      case "book": {
        const start = Math.floor(rand() * 18);
        const nights = 1 + Math.floor(rand() * 3);
        const days: Record<string, number> = {};
        for (let n = 0; n < nights; n++) days[dateFor(start + n)] = 10000;
        const rev = fake.emitBooking({
          propertyId: PROPERTY,
          roomTypeId: ROOM_TYPE,
          ratePlanId: RATE_PLAN,
          arrivalDate: dateFor(start),
          departureDate: dateFor(start + nights),
          days,
        });
        liveBookings.push(rev.bookingId);
        report.emitted += 1;
        break;
      }
      case "modify": {
        const id = liveBookings[Math.floor(rand() * liveBookings.length)];
        if (id) {
          const prev = fake.ledger.emitted.filter((r) => r.bookingId === id).at(-1)!;
          if (prev.status !== "cancelled") {
            const days = { ...prev.rooms[0]!.days };
            const extra = dateFor(Math.floor(rand() * 20));
            days[extra] = 9000;
            fake.modifyBooking(id, { days, departureDate: prev.departureDate });
            report.emitted += 1;
          }
        }
        break;
      }
      case "cancel": {
        const id = liveBookings[Math.floor(rand() * liveBookings.length)];
        if (
          id &&
          fake.ledger.emitted.filter((r) => r.bookingId === id).at(-1)!.status !== "cancelled"
        ) {
          fake.cancelBooking(id);
          report.emitted += 1;
        }
        break;
      }
      case "advance":
        clock.advance({ minutes: 1 + Math.floor(rand() * 5) });
        break;
      default:
        break;
    }
    // the world turns: webhooks fire (with faults), the poll runs, consumers derive, pushes happen
    await fake.flushWebhooks();
    if (webhookTriggers > 0 || rand() < 0.5) {
      webhookTriggers = 0;
      await ingest();
    }
    derive();
    if (rand() < 0.7) await push();
    if (rand() < 0.3) {
      clock.advance({ minutes: 6 });
      await ackSweep(deps, meta());
    }
  }

  // quiesce: no more faults, drain everything, run the sweep and the nightly reconcile
  fake.plan.rules.length = 0;
  await fake.flushWebhooks();
  for (let i = 0; i < 5; i++) {
    await ingest();
    derive();
    await push();
    clock.advance({ minutes: 6 });
    await ackSweep(deps, meta());
  }
  const drift = await verify(
    {
      orgId: "org-chaos",
      propertyId: PROPERTY,
      provider: fake,
      store,
      limiter,
      breaker,
      clock,
      meta: meta(),
    },
    "2026-10-01",
    "2026-10-31",
  );
  if (drift > 0) await push();

  // --- assertions ---------------------------------------------------------------------
  const storedBySystem = repo.revisions;
  for (const rev of fake.ledger.emitted) {
    const stored = storedBySystem.get(rev.systemId);
    if (!stored) report.failures.push(`revision ${rev.systemId} (${rev.status}) never stored`);
    else if (!stored.ackedAt)
      report.failures.push(`revision ${rev.systemId} stored but never acked`);
  }
  report.acked = fake.ledger.acks.length;
  if (fake.unackedRevisionIds().length > 0)
    report.failures.push(
      `${String(fake.unackedRevisionIds().length)} revisions still unacked at the provider`,
    );
  // ack never precedes commit: every ack in the ledger refers to a stored revision
  for (const a of fake.ledger.acks) {
    const rev = fake.ledger.emitted.find((r) => r.revisionId === a.revisionId)!;
    if (!storedBySystem.get(rev.systemId))
      report.failures.push(`ack for ${rev.systemId} without a stored revision`);
  }
  // projections equal the model fold (latest revision per booking by inserted_at, system_id)
  const byBooking = new Map<string, BookingRevisionPayload>();
  for (const r of fake.ledger.emitted) {
    const cur = byBooking.get(r.bookingId);
    if (
      !cur ||
      r.insertedAt > cur.insertedAt ||
      (r.insertedAt === cur.insertedAt && r.systemId > cur.systemId)
    )
      byBooking.set(r.bookingId, r);
  }
  for (const [bookingId, last] of byBooking) {
    const p = repo.projections.get(bookingId);
    if (!p) report.failures.push(`booking ${bookingId} has no projection`);
    else if (p.lastSystemId !== last.systemId || p.status !== last.status)
      report.failures.push(
        `booking ${bookingId} projection at ${p.lastSystemId}/${p.status}, expected ${last.systemId}/${last.status}`,
      );
  }
  // every ARI cell synced and equal to the provider
  const states = store.states();
  if (states.pending || states.in_flight || states.conflicted)
    report.failures.push(`cells not settled: ${JSON.stringify(states)}`);
  const desired = await store.loadDesired(PROPERTY, "2026-10-01", "2026-10-31");
  const mirror = fake.ledger.ari;
  const d = diffAri(stateFromCells(desired.rate, desired.availability), {
    restrictions: new Map(
      [...mirror.restrictions].filter(([k]) =>
        desired.rate.some((c) => `${c.ratePlanId}|${c.date}` === k),
      ),
    ),
    availability: new Map(
      [...mirror.availability].filter(([k]) =>
        desired.availability.some((c) => `${c.roomTypeId}|${c.date}` === k),
      ),
    ),
  });
  if (d.restrictions.length || d.availability.length)
    report.failures.push(
      `provider differs from desired on ${String(d.restrictions.length + d.availability.length)} cells`,
    );
  report.ledger = { webhooksDropped: fake.ledger.webhooksDropped, calls: fake.ledger.calls.length };
  report.ok = report.failures.length === 0;
  return report;
}

export type { RevisionDiff };
