import { LocalDate } from "./local-date.js";

/**
 * A half-open range of nights: [start, end). For a stay, start is check-in and
 * end is check-out, so nights() is the number of nights billed, and two stays
 * that share a check-out/check-in date do not overlap.
 */
export class DateRange {
  private constructor(
    readonly start: LocalDate,
    readonly end: LocalDate,
  ) {}

  static of(start: LocalDate, end: LocalDate): DateRange {
    if (!start.isBefore(end)) {
      throw new RangeError(
        `DateRange start must be before end: ${start.toString()} .. ${end.toString()}`,
      );
    }
    return new DateRange(start, end);
  }

  static parse(start: string, end: string): DateRange {
    return DateRange.of(LocalDate.parse(start), LocalDate.parse(end));
  }

  /** A single night starting on `date`. */
  static night(date: LocalDate): DateRange {
    return new DateRange(date, date.plusDays(1));
  }

  nights(): number {
    return this.start.daysUntil(this.end);
  }

  /** True if `date` is one of the nights in this range. */
  contains(date: LocalDate): boolean {
    return !date.isBefore(this.start) && date.isBefore(this.end);
  }

  overlaps(other: DateRange): boolean {
    return this.start.isBefore(other.end) && other.start.isBefore(this.end);
  }

  /** The common nights, or null when the ranges do not overlap. */
  intersect(other: DateRange): DateRange | null {
    const start = this.start.isAfter(other.start) ? this.start : other.start;
    const end = this.end.isBefore(other.end) ? this.end : other.end;
    return start.isBefore(end) ? new DateRange(start, end) : null;
  }

  /** True if `other` starts exactly where this ends, or vice versa. */
  isAdjacentTo(other: DateRange): boolean {
    return this.end.equals(other.start) || other.end.equals(this.start);
  }

  equals(other: DateRange): boolean {
    return this.start.equals(other.start) && this.end.equals(other.end);
  }

  /** Every night in the range, in order. */
  *dates(): IterableIterator<LocalDate> {
    for (let d = this.start; d.isBefore(this.end); d = d.plusDays(1)) yield d;
  }

  toString(): string {
    return `[${this.start.toString()}, ${this.end.toString()})`;
  }

  toJSON(): { start: string; end: string } {
    return { start: this.start.toString(), end: this.end.toString() };
  }
}
