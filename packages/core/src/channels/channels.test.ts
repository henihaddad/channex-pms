import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { transition } from "./state.js";
import {
  coverageWarnings,
  mappingDiff,
  nameSimilarity,
  suggestMappings,
  validateMappings,
} from "./mapping.js";
import { describeChannelEvent, sortWorstFirst } from "./health.js";
import type { ConnectionState, MappingRow, OurRatePlan, TheirRoom } from "./types.js";

const ours: OurRatePlan[] = [
  {
    id: "rp-dbl-std",
    title: "Standard",
    propertyId: "p1",
    roomTypeId: "rt-dbl",
    roomTypeTitle: "Double Room",
    occupancy: 2,
    isDerived: false,
  },
  {
    id: "rp-dbl-nr",
    title: "Non-refundable",
    propertyId: "p1",
    roomTypeId: "rt-dbl",
    roomTypeTitle: "Double Room",
    occupancy: 2,
    isDerived: true,
  },
  {
    id: "rp-suite",
    title: "Standard",
    propertyId: "p1",
    roomTypeId: "rt-suite",
    roomTypeTitle: "Junior Suite",
    occupancy: 3,
    isDerived: false,
  },
];
const theirs: TheirRoom[] = [
  {
    code: "R1",
    title: "Double",
    rates: [
      { code: "STD", title: "Standard Rate", occupancy: 2 },
      { code: "NRF", title: "Non Refundable", occupancy: 2 },
    ],
  },
  { code: "R2", title: "Jr Suite", rates: [{ code: "STD", title: "Standard Rate", occupancy: 3 }] },
];

describe("connection state machine (CH-4, CH-8)", () => {
  it("activation is only reachable through testing and mapping", () => {
    expect(transition("draft", "activated").ok).toBe(false);
    const s1 = transition("draft", "test_ok");
    const s2 = s1.ok ? transition(s1.value, "mappings_saved") : s1;
    const s3 = s2.ok ? transition(s2.value, "activated") : s2;
    expect(s3.ok && s3.value).toBe("active");
  });
  it("pause is reversible without re-testing and removed is terminal", () => {
    const p = transition("active", "paused");
    expect(p.ok && p.value).toBe("paused");
    const r = transition("paused", "resumed");
    expect(r.ok && r.value).toBe("active");
    const states: ConnectionState[] = ["draft", "testing", "mapped", "active", "paused", "error"];
    for (const s of states) expect(transition(s, "removed").ok).toBe(true);
    expect(transition("removed", "resumed").ok).toBe(false);
  });
});

describe("mapping suggestions (MAP-1)", () => {
  it("matches by room and rate names with occupancy, one target per plan", () => {
    const s = suggestMappings(ours, theirs);
    const byPlan = Object.fromEntries(s.map((x) => [x.ratePlanId, `${x.roomCode}/${x.rateCode}`]));
    expect(byPlan["rp-dbl-std"]).toBe("R1/STD");
    expect(byPlan["rp-dbl-nr"]).toBe("R1/NRF");
    expect(byPlan["rp-suite"]).toBe("R2/STD");
    expect(new Set(Object.values(byPlan)).size).toBe(3);
    for (const x of s) expect(x.confidence).toBeGreaterThan(0.2);
  });
  it("previously accepted mappings win with confidence 1", () => {
    const history: MappingRow[] = [{ ratePlanId: "rp-dbl-std", roomCode: "R2", rateCode: "STD" }];
    const s = suggestMappings(ours, theirs, history);
    expect(s.find((x) => x.ratePlanId === "rp-dbl-std")).toMatchObject({
      roomCode: "R2",
      confidence: 1,
    });
  });
  it("similarity is symmetric and bounded", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), (a, b) => {
        const x = nameSimilarity(a, b);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(Math.abs(x - nameSimilarity(b, a))).toBeLessThan(1e-9);
      }),
    );
  });
  it("never proposes the same channel rate twice nor the same plan twice", () => {
    const arbPlan = fc.record({
      id: fc.uuid(),
      title: fc.constantFrom("Standard", "Flexible", "NR", "Deal"),
      propertyId: fc.constant("p"),
      roomTypeId: fc.constantFrom("a", "b", "c"),
      roomTypeTitle: fc.constantFrom("Double", "Twin", "Suite"),
      occupancy: fc.integer({ min: 1, max: 4 }),
      isDerived: fc.boolean(),
    });
    const arbRoom = fc.record({
      code: fc.uuid(),
      title: fc.constantFrom("Double", "Twin", "Suite", "Studio"),
      rates: fc.array(
        fc.record({
          code: fc.uuid(),
          title: fc.constantFrom("Standard", "Flexible", "NR"),
          occupancy: fc.integer({ min: 1, max: 4 }),
        }),
        { maxLength: 3 },
      ),
    });
    fc.assert(
      fc.property(
        fc.array(arbPlan, { maxLength: 6 }),
        fc.array(arbRoom, { maxLength: 4 }),
        (o, t) => {
          const s = suggestMappings(o, t);
          expect(new Set(s.map((x) => x.ratePlanId)).size).toBe(s.length);
          expect(new Set(s.map((x) => `${x.roomCode}::${x.rateCode}`)).size).toBe(s.length);
        },
      ),
    );
  });
});

describe("coverage warnings and validation (MAP-2, MAP-3)", () => {
  it("lists unmapped plans, room types, channel rooms and duplicates", () => {
    const rows: MappingRow[] = [
      { ratePlanId: "rp-dbl-std", roomCode: "R1", rateCode: "STD", occupancy: 2 },
      { ratePlanId: "rp-dbl-nr", roomCode: "R1", rateCode: "STD", occupancy: 2 },
    ];
    const codes = coverageWarnings(ours, theirs, rows).map((w) => w.code);
    expect(codes).toContain("unmapped_rate_plan");
    expect(codes).toContain("unmapped_room_type");
    expect(codes).toContain("channel_room_unmapped");
    expect(codes).toContain("duplicate_target");
  });
  it("flags occupancy the channel expects but we do not sell", () => {
    const rows: MappingRow[] = [
      { ratePlanId: "rp-dbl-std", roomCode: "R2", rateCode: "STD", occupancy: 3 },
    ];
    expect(coverageWarnings(ours, theirs, rows).some((w) => w.code === "occupancy_gap")).toBe(true);
  });
  it("blocks cross-property references and derived plans where a base is expected", () => {
    const foreign: OurRatePlan = { ...ours[0]!, id: "rp-other", propertyId: "p2" };
    const rows: MappingRow[] = [
      { ratePlanId: "rp-other", roomCode: "R1", rateCode: "STD" },
      { ratePlanId: "rp-dbl-nr", roomCode: "R1", rateCode: "NRF" },
      { ratePlanId: "rp-suite", roomCode: "R9", rateCode: "STD" },
    ];
    const errs = validateMappings(rows, [...ours, foreign], "p1", theirs, {
      channelExpectsBaseRates: true,
    });
    expect(errs.map((e) => e.code).sort()).toEqual([
      "cross_property",
      "derived_where_base_expected",
      "unknown_channel_target",
    ]);
  });
  it("diff shows what starts and stops selling (MAP-4)", () => {
    const before: MappingRow[] = [
      { ratePlanId: "a", roomCode: "R1", rateCode: "STD" },
      { ratePlanId: "b", roomCode: "R1", rateCode: "NRF" },
    ];
    const after: MappingRow[] = [
      { ratePlanId: "a", roomCode: "R2", rateCode: "STD" },
      { ratePlanId: "c", roomCode: "R1", rateCode: "NRF" },
    ];
    const d = mappingDiff(before, after);
    expect(d.startsSelling.map((r) => r.ratePlanId)).toEqual(["c"]);
    expect(d.stopsSelling.map((r) => r.ratePlanId)).toEqual(["b"]);
    expect(d.changed.map((r) => r.after.ratePlanId)).toEqual(["a"]);
  });
});

describe("channel health (CH-7, worst first)", () => {
  it("every alert names property, channel, consequence and action", () => {
    for (const type of [
      "disconnect_channel",
      "channel_removal_warning",
      "credentials_invalid",
      "rate_error",
      "readiness_regression",
      "drift",
      "sync_warning",
      "booking_new",
    ]) {
      const a = describeChannelEvent(type, {
        propertyTitle: "Alfama",
        channelTitle: "Booking.com",
      });
      expect(a.title).toContain("Alfama");
      expect(a.title).toContain("Booking.com");
      expect(a.consequence.length).toBeGreaterThan(0);
      expect(a.action.length).toBeGreaterThan(0);
    }
    expect(
      describeChannelEvent("disconnect_listing", { propertyTitle: "x", channelTitle: "y" })
        .severity,
    ).toBe("p1");
  });
  it("sorts broken connections first", () => {
    const base = {
      ready: true,
      failedCells: 0,
      pendingCells: 0,
      openP1: 0,
      openP2: 0,
      lastPushAt: null,
    };
    const rows = [
      { ...base, id: "ok", state: "active" as const },
      { ...base, id: "err", state: "error" as const },
      { ...base, id: "gaps", state: "active" as const, ready: false },
      { ...base, id: "p1", state: "active" as const, openP1: 1 },
    ];
    expect(sortWorstFirst(rows).map((r) => r.id)).toEqual(["err", "gaps", "p1", "ok"]);
  });
});
