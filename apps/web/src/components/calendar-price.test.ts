import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parsePrice, priceFigure, priceInput, priceText } from "./calendar-price";

describe("parsePrice", () => {
  it("reads a price the way a host types it, in either decimal mark", () => {
    expect(parsePrice("120", "EUR")).toBe(12000);
    expect(parsePrice("120.50", "EUR")).toBe(12050);
    expect(parsePrice("120,50", "EUR")).toBe(12050);
    expect(parsePrice("120,5", "EUR")).toBe(12050);
    expect(parsePrice("1 200,50", "EUR")).toBe(120050);
    expect(parsePrice("1.200,50", "EUR")).toBe(120050);
    expect(parsePrice("1,200.50", "USD")).toBe(120050);
    expect(parsePrice("1,200", "USD")).toBe(120000);
    expect(parsePrice("1.200", "EUR")).toBe(120000);
    expect(parsePrice("€ 120", "EUR")).toBe(12000);
    expect(parsePrice("120 €", "EUR")).toBe(12000);
    expect(parsePrice("0", "EUR")).toBe(0);
    expect(parsePrice("١٢٠٫٥٠", "EUR")).toBe(12050);
  });

  it("uses the currency's exponent", () => {
    expect(parsePrice("12000", "JPY")).toBe(12000);
    expect(parsePrice("12,000", "JPY")).toBe(12000);
    expect(parsePrice("120,5", "JPY")).toBeNull();
    expect(parsePrice("1.250", "TND")).toBe(1250);
  });

  it("refuses what is not a price of 0 or more", () => {
    for (const t of ["", " ", "abc", "-5", "12a3", "120.5055", "1..2", "1,2,3"])
      expect(parsePrice(t, "EUR")).toBeNull();
  });

  it("round-trips what the field shows, in every locale", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom("en", "fr", "ar", "es", "pt"),
        fc.constantFrom("EUR", "USD", "JPY", "TND"),
        (minor, locale, currency) =>
          parsePrice(priceInput(minor, currency, locale), currency) === minor,
      ),
    );
  });
});

describe("price text", () => {
  it("writes the field value with the locale's mark and no trailing zeros", () => {
    expect(priceInput(12000, "EUR", "en")).toBe("120");
    expect(priceInput(12050, "EUR", "en")).toBe("120.50");
    expect(priceInput(12050, "EUR", "fr")).toBe("120,50");
    expect(priceInput(12000, "JPY", "fr")).toBe("12000");
    expect(priceInput(undefined, "EUR", "en")).toBe("");
  });

  it("copies the decimal amount with the currency's exponent", () => {
    expect(priceText(12050, "EUR")).toBe("120.50");
    expect(priceText(12000, "JPY")).toBe("12000");
  });

  it("shows the figure with the currency's decimals only when not whole", () => {
    expect(priceFigure(12000, "EUR", "en")).toBe("120");
    expect(priceFigure(124000, "EUR", "en")).toBe("1,240");
    expect(priceFigure(12050, "EUR", "en")).toBe("120.50");
    expect(priceFigure(12000, "JPY", "en")).toBe("12,000");
  });
});
