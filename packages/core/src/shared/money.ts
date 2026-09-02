/**
 * Money is an integer amount of minor units (cents, millimes) in one currency.
 * Floats are banned for money by lint rule (spec 14 §14.7).
 *
 * Amounts are plain integers, not bigint: 2^53 minor units is ~90 trillion in a
 * two-decimal currency, far beyond any statement this product will ever produce.
 */

/** Minor-unit exponents that differ from the default of 2 (ISO 4217). */
const EXPONENTS: Readonly<Record<string, number>> = {
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export type Rounding = "half-even" | "half-up" | "down";

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Currency mismatch: ${a} vs ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

const CURRENCY = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    /** Integer minor units. */
    readonly minor: number,
    /** ISO 4217 code, upper case. */
    readonly currency: string,
  ) {}

  static exponent(currency: string): number {
    return EXPONENTS[currency] ?? 2;
  }

  /** From integer minor units. */
  static of(minor: number, currency: string): Money {
    if (!Number.isSafeInteger(minor)) {
      throw new TypeError(`Money minor units must be a safe integer, got ${String(minor)}`);
    }
    if (!CURRENCY.test(currency)) {
      throw new TypeError(`Invalid currency code: ${currency}`);
    }
    return new Money(minor, currency);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  /**
   * Parse a decimal string such as "12.50" or "-3" exactly, without floats.
   * Rejects more decimals than the currency allows.
   */
  static parse(text: string, currency: string): Money {
    const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
    if (!m) throw new TypeError(`Cannot parse money: "${text}"`);
    const [, sign, whole = "0", frac = ""] = m;
    const exp = Money.exponent(currency);
    if (frac.length > exp) {
      throw new TypeError(`"${text}" has more than ${String(exp)} decimals for ${currency}`);
    }
    const minor = Number(whole) * 10 ** exp + Number(frac.padEnd(exp, "0") || "0");
    return Money.of(sign ? -minor : minor, currency);
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  isNegative(): boolean {
    return this.minor < 0;
  }

  equals(other: Money): boolean {
    return this.minor === other.minor && this.currency === other.currency;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.minor < other.minor ? -1 : this.minor > other.minor ? 1 : 0;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minor - other.minor, this.currency);
  }

  negate(): Money {
    return Money.of(-this.minor, this.currency);
  }

  abs(): Money {
    return Money.of(Math.abs(this.minor), this.currency);
  }

  /**
   * Multiply by an exact rational (numerator / denominator) with explicit rounding.
   * A 20 % management fee is `multiply(20, 100)`, never `* 0.2`.
   */
  multiply(numerator: number, denominator = 1, rounding: Rounding = "half-even"): Money {
    if (
      !Number.isSafeInteger(numerator) ||
      !Number.isSafeInteger(denominator) ||
      denominator === 0
    ) {
      throw new TypeError("multiply takes integer numerator and non-zero integer denominator");
    }
    return Money.of(divide(this.minor * numerator, denominator, rounding), this.currency);
  }

  /**
   * Split into parts proportional to `ratios` so that the parts sum exactly to
   * the whole. Remainder minor units go to the largest ratios first. This is
   * the operation behind owner/manager revenue splits (spec 17).
   */
  allocate(ratios: readonly number[]): Money[] {
    if (ratios.length === 0) throw new TypeError("allocate needs at least one ratio");
    if (ratios.some((r) => !Number.isSafeInteger(r) || r < 0)) {
      throw new TypeError("ratios must be non-negative integers");
    }
    const total = ratios.reduce((a, b) => a + b, 0);
    if (total === 0) throw new TypeError("ratios must not all be zero");

    const sign = this.minor < 0 ? -1 : 1;
    const whole = Math.abs(this.minor);
    const parts = ratios.map((r) => Math.floor((whole * r) / total));
    let remainder = whole - parts.reduce((a, b) => a + b, 0);

    const order = ratios
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.i);
    for (const i of order) {
      if (remainder === 0) break;
      if (ratios[i] === 0) continue;
      parts[i] = (parts[i] ?? 0) + 1;
      remainder -= 1;
    }
    return parts.map((p) => Money.of(sign * p, this.currency));
  }

  /** Decimal string with the currency's exponent, e.g. "12.50" or "-3.250" (TND). */
  toDecimalString(): string {
    const exp = Money.exponent(this.currency);
    const abs = Math.abs(this.minor);
    const whole = Math.floor(abs / 10 ** exp);
    const frac = String(abs % 10 ** exp).padStart(exp, "0");
    const sign = this.minor < 0 ? "-" : "";
    return exp === 0 ? `${sign}${String(whole)}` : `${sign}${String(whole)}.${frac}`;
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }

  toJSON(): { minor: number; currency: string } {
    return { minor: this.minor, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

/** Integer division with rounding. Both inputs are safe integers. */
function divide(n: number, d: number, rounding: Rounding): number {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const q = Math.trunc(n / d);
  const r = n - q * d; // same sign as n
  if (r === 0) return q;
  const twice = Math.abs(r) * 2;
  const sign = n < 0 ? -1 : 1;
  switch (rounding) {
    case "down":
      return q;
    case "half-up":
      return twice >= d ? q + sign : q;
    case "half-even":
      if (twice > d) return q + sign;
      if (twice < d) return q;
      return q % 2 === 0 ? q : q + sign;
  }
}
