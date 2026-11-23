import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { bpsToPercent, decimalToMinor, minorToDecimal, percentToBps } from "./amounts";

describe("amounts", () => {
  it("reads money as hosts type it, in the currency's own exponent", () => {
    expect(decimalToMinor("12.50", "EUR")).toBe(1250);
    expect(decimalToMinor("12,5", "EUR")).toBe(1250);
    expect(decimalToMinor("2", "EUR")).toBe(200);
    expect(decimalToMinor("1 500", "EUR")).toBe(150000);
    expect(decimalToMinor("1,234.50", "USD")).toBe(123450);
    expect(decimalToMinor("1.234,50", "EUR")).toBe(123450);
    expect(decimalToMinor("15 €", "EUR")).toBe(1500);
    expect(decimalToMinor("500", "JPY")).toBe(500);
    expect(decimalToMinor("12.500", "TND")).toBe(12500);
  });
  it("tells an empty field from a wrong one", () => {
    expect(decimalToMinor("", "EUR")).toBeNull();
    expect(decimalToMinor("  ", "EUR")).toBeNull();
    expect(decimalToMinor("abc", "EUR")).toBeUndefined();
    expect(decimalToMinor("-5", "EUR")).toBeUndefined();
    expect(decimalToMinor("1.5", "JPY")).toBeUndefined();
    expect(decimalToMinor("1.234", "EUR")).toBeUndefined();
  });
  it("shows a stored amount the way it would be typed back", () => {
    expect(minorToDecimal(1250, "EUR")).toBe("12.50");
    expect(minorToDecimal(200, "EUR")).toBe("2");
    expect(minorToDecimal(500, "JPY")).toBe("500");
    expect(minorToDecimal(null, "EUR")).toBe("");
  });
  it("round-trips every amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.constantFrom("EUR", "JPY", "TND", "USD"),
        (minor, currency) => decimalToMinor(minorToDecimal(minor, currency), currency) === minor,
      ),
    );
  });
  it("reads percentages as basis points", () => {
    expect(percentToBps("20")).toBe(2000);
    expect(percentToBps("7.5")).toBe(750);
    expect(percentToBps("7,25 %")).toBe(725);
    expect(percentToBps("0")).toBe(0);
    expect(percentToBps("")).toBeNull();
    expect(percentToBps("7.255")).toBeUndefined();
    expect(percentToBps("-1")).toBeUndefined();
    expect(bpsToPercent(2000)).toBe("20");
    expect(bpsToPercent(750)).toBe("7.5");
    expect(bpsToPercent(725)).toBe("7.25");
    expect(bpsToPercent(5)).toBe("0.05");
    expect(bpsToPercent(null)).toBe("");
  });
  it("round-trips every percentage", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        (bps) => percentToBps(bpsToPercent(bps)) === bps,
      ),
    );
  });
});
