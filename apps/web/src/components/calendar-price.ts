import { Money } from "@pms/core";

/**
 * Prices as a host types them and reads them in the calendar. Money stays integer minor units
 * (CLAUDE.md rule 4): text becomes minor units through `Money.parse`, with the currency's own
 * exponent, never through a float.
 */

/** Arabic-Indic and extended Arabic-Indic digits, as an Arabic keyboard types them. */
const DIGITS = /[٠-٩۰-۹]/g;
const latinDigit = (d: string): string => {
  const c = d.charCodeAt(0);
  return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
};

/** The decimal mark of a locale ("," in French, "." in English), "." when it is neither. */
export function decimalMark(locale: string): "," | "." {
  const part = new Intl.NumberFormat(locale)
    .formatToParts(1.5)
    .find((p) => p.type === "decimal")?.value;
  return part === "," ? "," : ".";
}

/**
 * "120", "120.50", "120,50", "1 200,50", "1,200.50", "€ 120" → minor units; null when the text
 * is not a price of 0 or more with at most the currency's decimals. Either mark is accepted as
 * the decimal one: the last "." or "," followed by no more digits than the currency allows; a
 * mark followed by exactly three digits in a currency of fewer decimals groups thousands.
 */
export function parsePrice(text: string, currency: string): number | null {
  const exp = Money.exponent(currency);
  const t = text
    .replace(DIGITS, latinDigit)
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[\s  ']/g, "")
    // a currency symbol or code before or after the figure, never inside it
    .replace(/^[^\d.,-]+|[^\d.,-]+$/g, "");
  if (t === "" || /[^\d.,]/.test(t)) return null;
  const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  let whole = t;
  let frac = "";
  if (last >= 0) {
    const after = t.slice(last + 1);
    const grouping = after.length === 3 && exp < 3 && /^\d{1,3}([.,]\d{3})*$/.test(t);
    if (!grouping) {
      whole = t.slice(0, last);
      frac = after;
    }
  }
  // marks left in the whole part group thousands, in threes ("1.200", "12,000,000")
  if (/[.,]/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null;
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (whole === "" && frac === "")) return null;
  if (frac.length > exp) return null;
  try {
    const m = Money.parse(frac ? `${whole || "0"}.${frac}` : whole, currency);
    return Number.isSafeInteger(m.minor) && m.minor >= 0 ? m.minor : null;
  } catch {
    return null;
  }
}

/** Minor units as an editable field value: "120" or "120,50" in the locale's mark, no symbol. */
export function priceInput(minor: number | undefined, currency: string, locale: string): string {
  if (minor === undefined) return "";
  const s = Money.of(minor, currency).toDecimalString();
  const [w, f] = s.split(".");
  if (!f || /^0+$/.test(f)) return w!;
  return `${w!}${decimalMark(locale)}${f}`;
}

/** Minor units as plain text for the clipboard: "120.50", with the currency's exponent. */
export const priceText = (minor: number, currency: string): string =>
  Money.of(minor, currency).toDecimalString();

/**
 * The figure a night's tile shows: the locale's digits and grouping, the currency's decimals
 * only when the amount is not whole ("120", "1,240", "120.50"), no symbol. The same arithmetic
 * as `money()` in lib/format, the one place minor units become text.
 */
export function priceFigure(minor: number, currency: string, locale: string): string {
  const exp = Money.exponent(currency);
  const unit = 10 ** exp;
  const whole = minor % unit === 0;
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, {
    minimumFractionDigits: whole ? 0 : exp,
    maximumFractionDigits: whole ? 0 : exp,
  }).format(minor / unit);
}
