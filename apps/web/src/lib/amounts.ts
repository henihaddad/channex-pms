/**
 * Amounts as hosts type them, converted to what is stored: money in the currency ("12.50 EUR",
 * "1 500", "12,5") to integer minor units, percentages ("20", "7.5 %") to integer basis points.
 * Exact string arithmetic, never floats (CLAUDE.md rule 4); the currency's exponent comes from
 * ISO 4217 through `Money`, so a zero-decimal currency takes no decimals. Pure, so the server
 * action and the form that shows the stored value back share it.
 */

import { Money } from "@pms/core";

/** Drop spaces (incl. narrow no-break) and a trailing % or currency code; read "," as the decimal point. */
function normalise(raw: string): string | null {
  const s = raw
    .replace(/[\s  ]/g, "")
    .replace(/%$/, "")
    .replace(/[A-Za-z€$£¥]+$/, "")
    .replace(/^[€$£¥]/, "");
  if (s === "") return null;
  // one separator is the decimal point; "1,234.50" and "1.234,50" use the last one
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (lastSep === -1) return /^-?\d+$/.test(s) ? s : null;
  const whole = s.slice(0, lastSep).replace(/[.,]/g, "");
  const frac = s.slice(lastSep + 1);
  const out = `${whole || "0"}.${frac}`;
  return /^-?\d+\.\d+$/.test(out) ? out : null;
}

/** "12.50" EUR → 1250; "" → null; "abc", "1.234" JPY (too many decimals), negatives → undefined. */
export function decimalToMinor(raw: string, currency: string): number | null | undefined {
  const s = normalise(raw);
  if (s === null) return raw.trim() === "" ? null : undefined;
  if (s.startsWith("-")) return undefined;
  try {
    return Money.parse(s, currency.toUpperCase()).minor;
  } catch {
    return undefined;
  }
}

/** 1250 EUR → "12.50", 1200 → "12", 500 JPY → "500": what a host would type back in. */
export function minorToDecimal(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const text = Money.of(minor, currency.toUpperCase()).toDecimalString();
  return text.replace(/\.0+$/, "");
}

/** "20" → 2000, "7.5" → 750, "7,25 %" → 725; "" → null; more than 2 decimals or negative → undefined. */
export function percentToBps(raw: string): number | null | undefined {
  const s = normalise(raw);
  if (s === null) return raw.trim() === "" ? null : undefined;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** 2000 → "20", 750 → "7.5", 725 → "7.25". */
export function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  const whole = Math.trunc(bps / 100);
  const frac = String(Math.abs(bps % 100))
    .padStart(2, "0")
    .replace(/0+$/, "");
  return frac ? `${String(whole)}.${frac}` : String(whole);
}
