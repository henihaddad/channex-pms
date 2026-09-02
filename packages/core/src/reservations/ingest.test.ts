import { describe, expect, it } from "vitest";
import { FakeClock } from "../shared/clock.js";
import type { BookingRevisionPayload, ConnectivityProvider } from "../connectivity/port.js";
import { ValidationError } from "../connectivity/errors.js";
import { ackSweep, ingestProperty } from "./ingest.js";
import { MemoryBookingRepository } from "./memory-repo.js";
import { diffProjection, projectRevision } from "./projection.js";

function rev(over: Partial<BookingRevisionPayload> = {}): BookingRevisionPayload {
  return {
    revisionId: over.revisionId ?? "r1",
    bookingId: over.bookingId ?? "b1",
    systemId: over.systemId ?? "1001",
    propertyId: "p",
    status: over.status ?? "new",
    arrivalDate: "2026-10-01",
    departureDate: "2026-10-03",
    currency: "EUR",
    amount: 20000,
    otaName: "Booking.com",
    otaReservationCode: "X",
    insertedAt: over.insertedAt ?? "2026-09-01T10:00:00Z",
    rooms: over.rooms ?? [
      {
        roomTypeId: "rt",
        ratePlanId: "rp",
        checkinDate: "2026-10-01",
        checkoutDate: "2026-10-03",
        days: { "2026-10-01": 10000, "2026-10-02": 10000 },
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [],
      },
    ],
    customer: { name: "A", surname: "B" },
    services: [],
    taxes: [],
    raw: {},
    ...over,
  };
}

function harness(feed: BookingRevisionPayload[][], opts: { failAckOnce?: boolean } = {}) {
  const repo = new MemoryBookingRepository();
  const clock = new FakeClock("2026-09-01T10:05:00Z");
  const acked: string[] = [];
  let pages = [...feed];
  let ackCalls = 0;
  const provider = {
    listBookingRevisions: async () => {
      const page = pages.shift() ?? [];
      return { revisions: page.filter((r) => !acked.includes(r.revisionId)) };
    },
    ackBookingRevisions: async (ids: string[]) => {
      ackCalls += 1;
      if (opts.failAckOnce && ackCalls === 1) throw new ValidationError("ack failed");
      acked.push(...ids);
    },
  } as unknown as ConnectivityProvider;
  const alerts = { unmapped: [] as string[], lagging: [] as string[] };
  const deps = {
    provider,
    repo,
    clock,
    orgId: "org",
    alerts: {
      unmappedBooking: async (i: { bookingId: string }) => {
        alerts.unmapped.push(i.bookingId);
      },
      ackLagging: async (i: { revisionId: string }) => {
        alerts.lagging.push(i.revisionId);
      },
    },
  };
  return {
    repo,
    clock,
    acked,
    deps,
    alerts,
    setPages: (p: BookingRevisionPayload[][]) => {
      pages = p;
    },
  };
}
const meta = { dedupeKey: "k", requestId: "r" };

describe("ingestProperty", () => {
  it("applies a new revision, emits the diff event, then acks", async () => {
    const { repo, acked, deps } = harness([[rev()]]);
    const s = await ingestProperty(deps, "p", meta);
    expect(s).toMatchObject({ seen: 1, applied: 1, acked: 1 });
    expect(acked).toEqual(["r1"]);
    expect(repo.projections.get("b1")?.status).toBe("new");
    expect(repo.events[0]).toMatchObject({
      type: "booking.revision_applied",
      dedupeKey: "booking.revision_applied:1001",
    });
    const diff = (repo.events[0]!.payload as { diff: { nightsAdded: unknown[] } }).diff;
    expect(diff.nightsAdded).toHaveLength(2);
  });

  it("duplicate deliveries are no-ops and unacked duplicates are re-acked (BK-2)", async () => {
    const { repo, acked, deps, setPages } = harness([[rev()]], { failAckOnce: true });
    const first = await ingestProperty(deps, "p", meta);
    expect(first).toMatchObject({ applied: 1, ackFailures: 1 });
    expect(repo.projections.size).toBe(1);
    setPages([[rev()]]);
    const second = await ingestProperty(deps, "p", meta);
    expect(second).toMatchObject({ applied: 0, reacked: 1, acked: 1 });
    expect(acked).toEqual(["r1"]);
    // a webhook-triggered re-pull that serves an already-acked revision (Channex retries are normal traffic)
    acked.length = 0;
    setPages([[rev()]]);
    expect((await ingestProperty(deps, "p", meta)).duplicates).toBe(1);
  });

  it("out-of-order revisions keep history without regressing the projection (BK-5)", async () => {
    const modified = rev({
      revisionId: "r2",
      systemId: "1002",
      status: "modified",
      insertedAt: "2026-09-01T11:00:00Z",
      rooms: [
        {
          roomTypeId: "rt",
          ratePlanId: "rp",
          checkinDate: "2026-10-01",
          checkoutDate: "2026-10-04",
          days: { "2026-10-01": 10000, "2026-10-02": 10000, "2026-10-03": 9000 },
          occupancy: { adults: 2, children: 0, infants: 0 },
          guests: [],
        },
      ],
    });
    const { repo, deps } = harness([[modified, rev()]]);
    const s = await ingestProperty(deps, "p", meta);
    expect(s).toMatchObject({ applied: 1, stale: 1, acked: 2 });
    expect(repo.projections.get("b1")?.status).toBe("modified");
    expect(repo.revisions.size).toBe(2);
  });

  it("cancellation frees the nights and unmapped bookings raise the resolution alert (spec 05 §5.7)", async () => {
    const cancelled = rev({
      revisionId: "r3",
      systemId: "1003",
      status: "cancelled",
      insertedAt: "2026-09-02T00:00:00Z",
    });
    const unmapped = rev({
      revisionId: "r4",
      bookingId: "b2",
      systemId: "1004",
      rooms: [
        {
          roomTypeId: null,
          ratePlanId: null,
          checkinDate: "2026-10-01",
          checkoutDate: "2026-10-02",
          days: { "2026-10-01": 5000 },
          occupancy: { adults: 1, children: 0, infants: 0 },
          guests: [],
        },
      ],
    });
    const { repo, deps, alerts } = harness([[rev(), cancelled, unmapped]]);
    await ingestProperty(deps, "p", meta);
    const cancelEvent = repo.events.find(
      (e) => (e.payload as { revisionId: string }).revisionId === "r3",
    )!;
    expect(
      (cancelEvent.payload as { diff: { nightsRemoved: unknown[] } }).diff.nightsRemoved,
    ).toHaveLength(2);
    expect(repo.projections.get("b2")?.mappingState).toBe("unmapped_room");
    expect(alerts.unmapped).toHaveLength(1);
    expect(repo.events.some((e) => e.type === "booking.unmapped")).toBe(true);
  });

  it("ack sweep re-acks after 5 minutes and alerts after 10 (BK-3)", async () => {
    const { repo, deps, clock, alerts, acked } = harness([[rev()]], { failAckOnce: true });
    await ingestProperty(deps, "p", meta);
    expect(acked).toEqual([]);
    expect(await ackSweep(deps, meta)).toEqual({ reacked: 0, alerted: 0, failed: 0 }); // too young
    clock.advance({ minutes: 6 });
    expect(await ackSweep(deps, meta)).toEqual({ reacked: 1, alerted: 0, failed: 0 });
    expect(acked).toEqual(["r1"]);
    // an old one that keeps failing gets escalated
    repo.revisions.get("1001")!.ackedAt = null;
    clock.advance({ minutes: 10 });
    const failing = {
      ...deps,
      provider: {
        ...deps.provider,
        ackBookingRevisions: async () => {
          throw new ValidationError("down");
        },
      } as unknown as ConnectivityProvider,
    };
    expect(await ackSweep(failing, meta)).toEqual({ reacked: 0, alerted: 1, failed: 1 });
    expect(alerts.lagging).toEqual([repo.revisions.get("1001")!.revisionId]);
  });
});

describe("diffProjection", () => {
  it("computes nights added/removed across a date move", () => {
    const a = projectRevision(rev(), "b");
    const moved = projectRevision(
      rev({
        systemId: "2",
        rooms: [
          {
            roomTypeId: "rt",
            ratePlanId: "rp",
            checkinDate: "2026-10-02",
            checkoutDate: "2026-10-04",
            days: { "2026-10-02": 1, "2026-10-03": 1 },
            occupancy: { adults: 2, children: 0, infants: 0 },
            guests: [],
          },
        ],
      }),
      "b",
    );
    const d = diffProjection(a, moved);
    expect(d.nightsAdded.map((n) => n.date)).toEqual(["2026-10-03"]);
    expect(d.nightsRemoved.map((n) => n.date)).toEqual(["2026-10-01"]);
    expect(diffProjection(null, a).first).toBe(true);
  });
});
