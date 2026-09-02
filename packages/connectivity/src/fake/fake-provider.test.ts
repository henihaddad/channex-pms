import { describe, expect, it } from "vitest";
import { ThrottleError, TransientError } from "@pms/core";
import { FakeProvider } from "./fake-provider.js";

const meta = { dedupeKey: "k", requestId: "r" };

describe("FakeProvider", () => {
  it("serves the feed until acked, and records the ledger", async () => {
    const fake = new FakeProvider();
    const rev = fake.emitBooking({
      propertyId: "p",
      roomTypeId: "rt",
      ratePlanId: "rp",
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-03",
      days: { "2026-10-01": 10000, "2026-10-02": 10000 },
    });
    const page = await fake.listBookingRevisions("p", undefined, meta);
    expect(page.revisions.map((r) => r.revisionId)).toEqual([rev.revisionId]);
    await fake.ackBookingRevisions([rev.revisionId], meta);
    expect((await fake.listBookingRevisions("p", undefined, meta)).revisions).toEqual([]);
    expect(fake.ledger.acks).toHaveLength(1);
    fake.modifyBooking(rev.bookingId, {
      departureDate: "2026-10-04",
      days: { "2026-10-01": 10000, "2026-10-02": 10000, "2026-10-03": 9000 },
    });
    fake.cancelBooking(rev.bookingId);
    expect(fake.ledger.emitted.map((r) => r.status)).toEqual(["new", "modified", "cancelled"]);
    expect(fake.pendingWebhookCount).toBe(3);
  });

  it("injects faults deterministically from the seed", async () => {
    const plan = {
      seed: 42,
      rules: [
        { op: "push", probability: 0.5, fault: "429" as const },
        { op: "feed", times: 1, fault: "5xx" as const },
      ],
    };
    const outcomes = async () => {
      const fake = new FakeProvider(plan);
      const out: string[] = [];
      for (let i = 0; i < 6; i++) {
        try {
          await fake.pushAvailability(
            {
              propertyId: "p",
              entries: [
                { roomTypeId: "rt", dateFrom: "2026-10-01", dateTo: "2026-10-01", availability: 1 },
              ],
            },
            meta,
          );
          out.push("ok");
        } catch (e) {
          out.push(e instanceof ThrottleError ? "429" : "?");
        }
      }
      await expect(fake.listBookingRevisions("p", undefined, meta)).rejects.toBeInstanceOf(
        TransientError,
      );
      expect((await fake.listBookingRevisions("p", undefined, meta)).revisions).toEqual([]);
      return out;
    };
    const a = await outcomes();
    expect(a).toEqual(await outcomes());
    expect(a).toContain("429");
    expect(a).toContain("ok");
  });

  it("partial 422 rejects every other entry and applies the rest", async () => {
    const fake = new FakeProvider({
      seed: 1,
      rules: [{ op: "push.restrictions", times: 1, fault: "partial_422" }],
    });
    const r = await fake.pushRatesAndRestrictions(
      {
        propertyId: "p",
        entries: [
          { ratePlanId: "rp", dateFrom: "2026-10-01", dateTo: "2026-10-01", rate: 100 },
          { ratePlanId: "rp", dateFrom: "2026-10-02", dateTo: "2026-10-02", rate: 200 },
          { ratePlanId: "rp", dateFrom: "2026-10-03", dateTo: "2026-10-03", rate: 300 },
        ],
      },
      meta,
    );
    expect(r.accepted).toBe(2);
    expect(r.rejected.map((x) => x.index)).toEqual([1]);
    const snap = await fake.readAri(
      { propertyId: "p", dateFrom: "2026-10-01", dateTo: "2026-10-03" },
      meta,
    );
    expect(snap.restrictions.map((x) => x.date)).toEqual(["2026-10-01", "2026-10-03"]);
  });

  it("duplicates, reorders and drops webhooks per plan", async () => {
    const fake = new FakeProvider({
      seed: 7,
      rules: [
        { op: "webhook.deliver", times: 1, fault: "duplicate_webhook" },
        { op: "webhook.deliver", times: 1, fault: "drop_webhook" },
      ],
    });
    const seen: string[] = [];
    fake.webhookSink = async (w) => {
      seen.push(String(w.payload.revision_id));
    };
    const a = fake.emitBooking({
      propertyId: "p",
      roomTypeId: "rt",
      ratePlanId: "rp",
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-02",
      days: { "2026-10-01": 1 },
    });
    fake.emitBooking({
      propertyId: "p",
      roomTypeId: "rt",
      ratePlanId: "rp",
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-02",
      days: { "2026-10-01": 1 },
    });
    await fake.flushWebhooks();
    expect(seen).toEqual([a.revisionId, a.revisionId]);
    expect(fake.ledger.webhooksDropped).toBe(1);
  });
});
