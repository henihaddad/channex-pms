import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Money } from "../shared/money.js";
import {
  DEFAULT_PRICING,
  MAX_MARKUP_BPS,
  channelComparison,
  channelKey,
  guestPrice,
  parsePricingDefaults,
  parsePercentBps,
} from "./defaults.js";

describe("pricing defaults (spec 06 §6.6)", () => {
  it("reads what was stored and drops what makes no sense", () => {
    const d = parsePricingDefaults({
      markupBps: { airbnb: 1550, booking_com: 0, vrbo: -5, expedia: 1.5, nope: 100 },
      rounding: "five",
      discounts: { weeklyBps: 800, monthlyBps: 99_000, earlyBirdDays: 0, lastMinuteDays: 7 },
    });
    expect(d.markupBps).toEqual({ airbnb: 1550, booking_com: 0 });
    expect(d.rounding).toBe("five");
    expect(d.discounts.weeklyBps).toBe(800);
    expect(d.discounts.monthlyBps).toBeNull();
    expect(d.discounts.earlyBirdDays).toBe(DEFAULT_PRICING.discounts.earlyBirdDays);
    expect(d.discounts.lastMinuteDays).toBe(7);
  });

  it("treats nothing stored as the defaults", () => {
    expect(parsePricingDefaults(undefined)).toEqual(DEFAULT_PRICING);
    expect(parsePricingDefaults({ rounding: "weird" }).rounding).toBe("unit");
  });

  it("reads a typed percentage as basis points, without floats", () => {
    expect(parsePercentBps("+15.5%")).toBe(1550);
    expect(parsePercentBps("−8%")).toBe(800);
    expect(parsePercentBps("8,25 %")).toBe(825);
    expect(parsePercentBps("0")).toBe(0);
    expect(parsePercentBps("")).toBeNull();
    expect(parsePercentBps("ten")).toBeNull();
    expect(parsePercentBps("1.234")).toBeNull();
  });

  it("names the channel whatever the source calls it", () => {
    expect(channelKey("Booking.com")).toBe("booking_com");
    expect(channelKey("BookingCom")).toBe("booking_com");
    expect(channelKey("AirBNB")).toBe("airbnb");
    expect(channelKey("HomeAway")).toBe("vrbo");
    expect(channelKey("Hotels.com")).toBe("expedia");
    expect(channelKey(null)).toBe("direct");
    expect(channelKey("Offline")).toBe("direct");
    expect(channelKey("Agoda")).toBe("other");
  });

  it("adds the markup and rounds up to the next whole unit", () => {
    // €140 + 15.5 % = €161.70 → €162, as the design shows
    expect(guestPrice(Money.of(14_000, "EUR"), 1550).minor).toBe(16_200);
    expect(guestPrice(Money.of(14_000, "EUR"), 1550, "none").minor).toBe(16_170);
    expect(guestPrice(Money.of(14_000, "EUR"), 1550, "five").minor).toBe(16_500);
    expect(guestPrice(Money.of(14_050, "EUR"), 0).minor).toBe(14_050);
    // a zero-decimal currency rounds to whole yen
    expect(guestPrice(Money.of(10_001, "JPY"), 1000).minor).toBe(11_001);
  });

  it("never shows a guest less than the local price, and stays within one rounding step", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: MAX_MARKUP_BPS }),
        fc.constantFrom("none" as const, "unit" as const, "five" as const),
        (minor, markup, rounding) => {
          const rate = Money.of(minor, "EUR");
          const exact = rate.multiply(10_000 + markup, 10_000, "half-up").minor;
          const shown = guestPrice(rate, markup, rounding).minor;
          expect(Number.isSafeInteger(shown)).toBe(true);
          expect(shown).toBeGreaterThanOrEqual(minor);
          expect(shown).toBeGreaterThanOrEqual(markup === 0 ? minor : exact);
          expect(shown - exact).toBeLessThan(rounding === "five" ? 500 : 100);
        },
      ),
    );
  });

  it("compares with a channel the property is listed on, Airbnb first", () => {
    const local = Money.of(11_000, "EUR");
    const pricing = { markupBps: { airbnb: 1000, booking_com: 1500 }, rounding: "unit" as const };
    expect(channelComparison(local, pricing, ["airbnb", "booking_com"])).toEqual({
      channel: "airbnb",
      price: Money.of(12_100, "EUR"),
    });
    // not listed on Airbnb: the dearest listed channel
    expect(channelComparison(local, pricing, ["booking_com", "direct"])?.channel).toBe(
      "booking_com",
    );
    // a markup on a channel it is not listed on is no comparison at all
    expect(channelComparison(local, pricing, ["vrbo"])).toBeNull();
    expect(channelComparison(local, { markupBps: {}, rounding: "unit" }, ["airbnb"])).toBeNull();
  });

  it("never compares with a channel price below the direct price", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: MAX_MARKUP_BPS }),
        (minor, markup) => {
          const c = channelComparison(
            Money.of(minor, "EUR"),
            { markupBps: { booking_com: markup }, rounding: "five" },
            ["booking_com"],
          );
          if (markup === 0) expect(c).toBeNull();
          else expect(c!.price.minor).toBeGreaterThanOrEqual(minor);
        },
      ),
    );
  });
});
