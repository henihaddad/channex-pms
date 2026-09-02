import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CurrencyMismatchError, Money } from "./money.js";

const minor = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
const currency = fc.constantFrom("EUR", "USD", "TND", "JPY", "GBP");

describe("Money", () => {
  it("parses decimals exactly per currency exponent", () => {
    expect(Money.parse("12.50", "EUR").minor).toBe(1250);
    expect(Money.parse("12.5", "EUR").minor).toBe(1250);
    expect(Money.parse("-3.250", "TND").minor).toBe(-3250);
    expect(Money.parse("1000", "JPY").minor).toBe(1000);
    expect(() => Money.parse("1.234", "EUR")).toThrow(/decimals/);
    expect(() => Money.parse("abc", "EUR")).toThrow(/parse/);
  });

  it("round-trips through toDecimalString", () => {
    fc.assert(
      fc.property(minor, currency, (m, c) => {
        const money = Money.of(m, c);
        expect(Money.parse(money.toDecimalString(), c).equals(money)).toBe(true);
      }),
    );
  });

  it("refuses to mix currencies", () => {
    expect(() => Money.of(1, "EUR").add(Money.of(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("add and subtract are inverse", () => {
    fc.assert(
      fc.property(minor, minor, currency, (a, b, c) => {
        const x = Money.of(a, c);
        const y = Money.of(b, c);
        expect(x.add(y).subtract(y).equals(x)).toBe(true);
      }),
    );
  });

  it("multiplies by exact rationals with banker's rounding by default", () => {
    expect(Money.of(1000, "EUR").multiply(20, 100).minor).toBe(200);
    expect(Money.of(125, "EUR").multiply(1, 10).minor).toBe(12); // 12.5 -> 12 (even)
    expect(Money.of(135, "EUR").multiply(1, 10).minor).toBe(14); // 13.5 -> 14 (even)
    expect(Money.of(125, "EUR").multiply(1, 10, "half-up").minor).toBe(13);
    expect(Money.of(-125, "EUR").multiply(1, 10, "half-up").minor).toBe(-13);
    expect(Money.of(129, "EUR").multiply(1, 10, "down").minor).toBe(12);
  });

  it("allocate never loses or invents a minor unit", () => {
    const ratios = fc
      .array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 8 })
      .filter((r) => r.some((x) => x > 0));
    fc.assert(
      fc.property(minor, currency, ratios, (m, c, r) => {
        const whole = Money.of(m, c);
        const parts = whole.allocate(r);
        expect(parts).toHaveLength(r.length);
        const sum = parts.reduce((acc, p) => acc.add(p), Money.zero(c));
        expect(sum.equals(whole)).toBe(true);
        // no part differs from its exact share by more than one minor unit
        const total = r.reduce((a, b) => a + b, 0);
        parts.forEach((p, i) => {
          const exact = (m * (r[i] ?? 0)) / total;
          expect(Math.abs(p.minor - exact)).toBeLessThan(1 + 1e-9);
        });
      }),
    );
  });

  it("allocates a 80/20 owner split with the remainder to the larger share", () => {
    const [owner, manager] = Money.of(1001, "EUR").allocate([80, 20]);
    expect(owner?.minor).toBe(801);
    expect(manager?.minor).toBe(200);
  });

  it("formats three-decimal currencies", () => {
    expect(Money.of(9_344_000, "TND").toString()).toBe("9344.000 TND");
    expect(Money.of(-5, "EUR").toString()).toBe("-0.05 EUR");
    expect(Money.of(700, "JPY").toString()).toBe("700 JPY");
  });
});
