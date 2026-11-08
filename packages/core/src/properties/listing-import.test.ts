import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  fieldsToApply,
  listingImportPreview,
  nightlyPrices,
  usualMinStay,
  type ImportNight,
  type ListingSnapshot,
  type LocalSnapshot,
} from "./listing-import.js";

// 2026-11-13 is a Friday, 2026-11-14 a Saturday
const nights: ImportNight[] = [
  { date: "2026-11-12", available: true, priceMinor: 11800, minNights: 2 },
  { date: "2026-11-13", available: true, priceMinor: 14000, minNights: 2 },
  { date: "2026-11-14", available: true, priceMinor: 14000, minNights: 2 },
  { date: "2026-11-15", available: false, priceMinor: 11800, minNights: 3 },
  { date: "2026-11-16", available: true, priceMinor: null },
];
const remote: ListingSnapshot = {
  title: "Alfama Loft",
  city: "Lisbon",
  countryCode: "PT",
  bedrooms: 1,
  capacity: 4,
  summary: "A loft above the river.",
  amenities: ["wifi", "kitchen"],
  photos: ["a.jpg", "b.jpg"],
  currency: "EUR",
  nights,
};
const local: LocalSnapshot = {
  title: "Alfama loft",
  city: "Lisbon",
  country: "PT",
  bedrooms: 1,
  sleeps: 2,
  amenities: ["kitchen", "wifi"],
  photos: [],
  currency: "EUR",
  nights: nights.map((n) => ({
    ...n,
    priceMinor: n.priceMinor === null ? null : 10000,
    minNights: 2,
  })),
};

describe("calendar figures", () => {
  it("takes the median night, the median Friday/Saturday night and the usual minimum stay", () => {
    expect(nightlyPrices(nights, "EUR")).toEqual({
      kind: "prices",
      medianMinor: 14000,
      weekendMinor: 14000,
      nights: 4,
      currency: "EUR",
    });
    expect(usualMinStay(nights)).toBe(2);
    expect(nightlyPrices([], "EUR")).toBeNull();
    expect(usualMinStay([])).toBeNull();
  });
});

describe("listingImportPreview", () => {
  it("compares field by field against an existing property", () => {
    const p = listingImportPreview(remote, local);
    const by = Object.fromEntries(p.rows.map((r) => [r.key, r.result]));
    expect(by).toMatchObject({
      title: "same", // case does not make a different name
      city: "same",
      country: "same",
      bedrooms: "same",
      sleeps: "change",
      summary: "add",
      amenities: "same", // same items in another order
      photos: "add",
      prices: "change",
      minStay: "same",
      ratePlan: "same",
      bookings: "later",
    });
    expect(p.willChange).toBe(2);
    expect(p.willAdd).toBe(2);
    expect(p.fieldsRead).toBe(10);
    expect(p.unread).toBe(0);
    expect(p.rows.find((r) => r.key === "bookings")?.airbnb).toEqual({
      kind: "onActivation",
      blockedNights: 1,
    });
  });

  it("adds everything to a new property, which cannot drop its name or plan", () => {
    const p = listingImportPreview(remote, null);
    expect(p.rows.filter((r) => r.result === "add").map((r) => r.key)).toContain("title");
    expect(p.rows.find((r) => r.key === "title")?.optional).toBe(false);
    expect(p.rows.find((r) => r.key === "ratePlan")).toMatchObject({
      result: "add",
      optional: false,
    });
    // the name and plan are written even when unticked; the rest only when ticked
    const apply = fieldsToApply(p, new Set(["photos"]));
    expect([...apply].sort()).toEqual(["photos", "ratePlan", "title"]);
  });

  it("never writes a field Airbnb did not report", () => {
    const { summary: _s, bedrooms: _b, ...bare } = remote;
    const p = listingImportPreview(bare, local);
    expect(p.unread).toBe(2);
    expect(p.rows.find((r) => r.key === "summary")).toMatchObject({
      result: "unread",
      after: null,
    });
    expect(fieldsToApply(p, new Set(["summary", "bedrooms"])).size).toBe(0);
  });

  it("only ever applies ticked or required rows that change or add something", () => {
    const keys = [
      "title",
      "city",
      "summary",
      "amenities",
      "photos",
      "prices",
      "minStay",
      "bookings",
    ];
    fc.assert(
      fc.property(fc.subarray(keys), fc.boolean(), (ticked, isNew) => {
        const p = listingImportPreview(remote, isNew ? null : local);
        for (const k of fieldsToApply(p, new Set(ticked))) {
          const r = p.rows.find((x) => x.key === k)!;
          expect(["change", "add"]).toContain(r.result);
          expect(!r.optional || ticked.includes(k)).toBe(true);
        }
      }),
    );
  });
});
