/**
 * How numbers, money and dates read on screen (design canvas, November 2026): "€1,640", "82%",
 * "Fri 14 Nov", "3 nights". Money stays integer minor units everywhere else; this is the one
 * place it becomes text. Pure, so server and client components share it.
 */

import { Money } from "@pms/core";

/** English reads day-first and in pounds-and-pence style, as the design writes it ("Fri 14 Nov"). */
const dateLocale = (locale: string): string => (locale === "en" ? "en-GB" : locale);

/**
 * "€80" and "€80.50" in English, "80,50 €" in French, "¥12,000" for a zero-decimal currency,
 * "ZAR 450" where no symbol is common: the locale's own currency format, with the currency's
 * minor-unit exponent (ISO 4217) and no decimals when the amount is whole.
 */
/** Currencies whose short symbol is unambiguous to hosts; the rest show their ISO code. */
const SYMBOLIC = new Set(["EUR", "USD", "GBP", "JPY", "INR"]);

export function money(minor: number | null | undefined, currency: string, locale: string): string {
  if (minor === null || minor === undefined) return "—";
  const code = currency.toUpperCase();
  const exp = Money.exponent(code);
  const unit = 10 ** exp;
  const whole = minor % unit === 0;
  const n = new Intl.NumberFormat(dateLocale(locale), {
    style: "currency",
    currency: code,
    currencyDisplay: SYMBOLIC.has(code) ? "narrowSymbol" : "code",
    minimumFractionDigits: whole ? 0 : exp,
    maximumFractionDigits: whole ? 0 : exp,
  }).format(Math.abs(minor) / unit);
  return minor < 0 ? `−${n}` : n;
}

/** Whole percent from a ratio (0.82 → "82%") or from a percentage (82.4 → "82%"). */
export function percent(
  value: number | null | undefined,
  { ratio = true, locale = "en" }: { ratio?: boolean; locale?: string } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const whole = Math.round(ratio ? value * 100 : value);
  return new Intl.NumberFormat(dateLocale(locale), { style: "percent" }).format(whole / 100);
}

const parse = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** "Fri 14 Nov" */
export function day(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parse(iso));
}

/** "14 Nov" */
export function dayMonth(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parse(iso));
}

/** "Fri 14 → Mon 17 Nov", with the month once when both ends share it. */
export function stay(arrival: string, departure: string, locale = "en"): string {
  const a = parse(arrival);
  const d = parse(departure);
  const wd = (x: Date) =>
    new Intl.DateTimeFormat(dateLocale(locale), { weekday: "short", timeZone: "UTC" }).format(x);
  const mon = (x: Date) =>
    new Intl.DateTimeFormat(dateLocale(locale), { month: "short", timeZone: "UTC" }).format(x);
  const sameMonth = a.getUTCMonth() === d.getUTCMonth();
  return sameMonth
    ? `${wd(a)} ${a.getUTCDate()} → ${wd(d)} ${d.getUTCDate()} ${mon(d)}`
    : `${wd(a)} ${a.getUTCDate()} ${mon(a)} → ${wd(d)} ${d.getUTCDate()} ${mon(d)}`;
}

/** Whole nights between two dates. */
export function nightsBetween(arrival: string, departure: string): number {
  return Math.round((parse(departure).getTime() - parse(arrival).getTime()) / 86_400_000);
}

/** Whole days from today to a date (negative in the past). */
export function daysFrom(today: string, iso: string): number {
  return Math.round((parse(iso).getTime() - parse(today).getTime()) / 86_400_000);
}

/** "12 min", "1 hr, 12 min", "3 days" (or the locale's words): how long ago, as the inbox writes it. */
export function elapsed(fromIso: string, now: Date = new Date(), locale = "en"): string {
  const min = Math.max(1, Math.round((now.getTime() - new Date(fromIso).getTime()) / 60_000));
  const f = (n: number, unit: "minute" | "hour" | "day") =>
    new Intl.NumberFormat(dateLocale(locale), { style: "unit", unit, unitDisplay: "short" }).format(
      n,
    );
  if (min < 60) return f(min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${f(h, "hour")} ${f(min % 60, "minute")}` : f(h, "hour");
  return f(Math.floor(h / 24), "day");
}

/**
 * "15:00" from an "HH:MM[:SS]" time as written, or from an ISO instant in the given time zone (the
 * property's, spec 08): a deadline reads in the place it applies to, not in UTC.
 */
export function clock(value: string, timeZone = "UTC", locale = "en"): string {
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  return new Intl.DateTimeFormat(dateLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

/** Our own sources (staff, phone, walk-in, the booking site) read as "Direct", as the design writes it. */
export function channelLabel(ota: string | null | undefined, direct = "Direct"): string {
  if (!ota) return direct;
  return ["direct", "staff", "phone", "walk_in", "walk-in", "booking_engine", "website"].includes(
    ota.toLowerCase(),
  )
    ? direct
    : ota;
}
