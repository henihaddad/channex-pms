import { Temporal } from "temporal-polyfill";

/**
 * A calendar date with no time and no zone. A hotel night is a LocalDate,
 * never an instant (spec 14 §14.7). Backed by Temporal.PlainDate.
 */
export class LocalDate {
  private constructor(private readonly plain: Temporal.PlainDate) {}

  static of(year: number, month: number, day: number): LocalDate {
    return new LocalDate(Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" }));
  }

  /** Parse an ISO 8601 date, "2026-08-21". Anything else throws. */
  static parse(iso: string): LocalDate {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new TypeError(`Not an ISO date: "${iso}"`);
    return new LocalDate(Temporal.PlainDate.from(iso, { overflow: "reject" }));
  }

  /** Today in the given IANA time zone. A property's "today" is its own zone, never the server's. */
  static today(timeZone: string): LocalDate {
    return new LocalDate(Temporal.Now.plainDateISO(timeZone));
  }

  get year(): number {
    return this.plain.year;
  }

  get month(): number {
    return this.plain.month;
  }

  get day(): number {
    return this.plain.day;
  }

  /** ISO weekday, Monday = 1 … Sunday = 7. */
  get dayOfWeek(): number {
    return this.plain.dayOfWeek;
  }

  plusDays(n: number): LocalDate {
    return new LocalDate(this.plain.add({ days: n }));
  }

  minusDays(n: number): LocalDate {
    return this.plusDays(-n);
  }

  /** Signed number of days from this date until `other`. */
  daysUntil(other: LocalDate): number {
    return this.plain.until(other.plain, { largestUnit: "days" }).days;
  }

  compare(other: LocalDate): -1 | 0 | 1 {
    return Temporal.PlainDate.compare(this.plain, other.plain) as -1 | 0 | 1;
  }

  equals(other: LocalDate): boolean {
    return this.compare(other) === 0;
  }

  isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: LocalDate): boolean {
    return this.compare(other) > 0;
  }

  /** ISO string, "2026-08-21". Safe as a map key and a database value. */
  toString(): string {
    return this.plain.toString();
  }

  toJSON(): string {
    return this.toString();
  }
}
