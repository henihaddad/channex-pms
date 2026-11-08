import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  averageDailyRateMinor,
  contentCompleteness,
  MAX_AMENITIES,
  MIN_LISTING_PHOTOS,
  normaliseAmenities,
  occupancyBps,
  propertyAttention,
  type ContentInput,
} from "./overview.js";

describe("occupancyBps", () => {
  it("is sold over available in basis points", () => {
    expect(occupancyBps(15, 30)).toBe(5000);
    expect(occupancyBps(0, 30)).toBe(0);
    expect(occupancyBps(1, 3)).toBe(3333);
  });
  it("has no value when nothing was sellable", () => {
    expect(occupancyBps(0, 0)).toBeNull();
  });
  it("stays within 0..10000 whatever the counts", () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 500 }), fc.integer({ min: 1, max: 500 }), (s, a) => {
        const v = occupancyBps(s, a)!;
        return Number.isInteger(v) && v >= 0 && v <= 10_000;
      }),
    );
  });
});

describe("averageDailyRateMinor", () => {
  it("is revenue per sold night, in whole minor units", () => {
    expect(averageDailyRateMinor(33_600, 3)).toBe(11_200);
    expect(averageDailyRateMinor(10_001, 2)).toBe(5001);
    expect(averageDailyRateMinor(5000, 0)).toBeNull();
  });
});

describe("propertyAttention", () => {
  const ok = { state: "live", unmappedBookings: 0, failedCells: 0, provisioningError: null };
  it("is null for a healthy live property", () => {
    expect(propertyAttention(ok)).toBeNull();
  });
  it("puts a booking without a room first", () => {
    expect(
      propertyAttention({ ...ok, unmappedBookings: 2, failedCells: 4, state: "suspended" }),
    ).toEqual({ kind: "unmapped_bookings", count: 2 });
  });
  it("reports a failed setup only while the property is not live", () => {
    expect(propertyAttention({ ...ok, state: "draft", provisioningError: "timeout" })).toEqual({
      kind: "setup_failed",
      error: "timeout",
    });
    expect(propertyAttention({ ...ok, provisioningError: "old error" })).toBeNull();
  });
  it("then failed pushes, then suspension", () => {
    expect(propertyAttention({ ...ok, failedCells: 3 })).toEqual({ kind: "sync_failed", cells: 3 });
    expect(propertyAttention({ ...ok, state: "suspended" })).toEqual({ kind: "suspended" });
  });
});

describe("normaliseAmenities", () => {
  it("splits typed text, trims, drops blanks and duplicates, keeps the first spelling", () => {
    expect(normaliseAmenities("Wifi, Kitchen\n  washer \n\nwifi,Air  conditioning")).toEqual([
      "Wifi",
      "Kitchen",
      "washer",
      "Air conditioning",
    ]);
  });
  it("takes an imported list as is, capped", () => {
    expect(normaliseAmenities(["Pool", "pool", " "])).toEqual(["Pool"]);
    const many = Array.from({ length: MAX_AMENITIES + 20 }, (_, i) => `A${String(i)}`);
    expect(normaliseAmenities(many)).toHaveLength(MAX_AMENITIES);
  });
  it("never returns a blank or a case-duplicate", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (xs) => {
        const out = normaliseAmenities(xs);
        const keys = out.map((a) => a.toLowerCase());
        return out.every((a) => a.trim() === a && a !== "") && new Set(keys).size === keys.length;
      }),
    );
  });
});

describe("contentCompleteness", () => {
  const row = (title: string, over: Partial<ContentInput> = {}): ContentInput => ({
    title,
    photos: MIN_LISTING_PHOTOS,
    guidePublished: true,
    houseRulesWritten: true,
    pricingRailsSet: true,
    ...over,
  });
  it("counts what is done and names what is missing", () => {
    const c = contentCompleteness([
      row("Alfama Loft"),
      row("Happy Days", { photos: 2, guidePublished: false }),
      row("Korba", { photos: 0, guidePublished: false, pricingRailsSet: false }),
    ]);
    expect(c.photos).toMatchObject({ done: 1, total: 3, missing: ["Happy Days", "Korba"] });
    expect(c.photos.fewest).toEqual({ title: "Korba", photos: 0 });
    expect(c.guide).toEqual({ done: 1, total: 3, missing: ["Happy Days", "Korba"] });
    expect(c.houseRules).toEqual({ done: 3, total: 3, missing: [] });
    expect(c.pricingRails).toEqual({ done: 2, total: 3, missing: ["Korba"] });
  });
  it("is empty for an empty portfolio", () => {
    const c = contentCompleteness([]);
    expect(c.photos).toEqual({ done: 0, total: 0, missing: [], fewest: null });
  });
});
