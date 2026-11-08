/**
 * How numbers, money and dates read on screen (design canvas, November 2026): "€1,640", "82%",
 * "Fri 14 Nov", "3 nights". Money stays integer minor units everywhere else; this is the one
 * place it becomes text. Pure, so server and client components share it.
 */

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", INR: "₹" };

/** "€80", "€80.50", "ZAR 450": a symbol when the currency has a well-known one, the code otherwise. */
export function money(minor: number | null | undefined, currency: string, locale = "en"): string {
  if (minor === null || minor === undefined) return "—";
  const whole = minor % 100 === 0;
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(Math.abs(minor) / 100);
  const sign = minor < 0 ? "−" : "";
  const sym = SYMBOL[currency.toUpperCase()];
  return sym ? `${sign}${sym}${n}` : `${sign}${currency.toUpperCase()} ${n}`;
}

/** Whole percent from a ratio (0.82 → "82%") or from a percentage (82.4 → "82%"). */
export function percent(value: number | null | undefined, { ratio = true } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(ratio ? value * 100 : value)}%`;
}

/** English dates read day-first, as the design writes them ("Fri 14 Nov"). */
const dateLocale = (locale: string): string => (locale === "en" ? "en-GB" : locale);

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

/** "12 min", "1 h 12 min", "3 d": how long ago, as the inbox writes it. */
export function elapsed(fromIso: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(fromIso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** "15:00" from an ISO instant or an "HH:MM[:SS]" time. */
export function clock(value: string): string {
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const d = new Date(value);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
