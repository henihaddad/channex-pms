import { LocalDate, WEEKDAYS, type Weekday } from "@pms/core";

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[LocalDate.parse(date).dayOfWeek - 1]!;
}

/** Inclusive date range expansion, optionally filtered by weekdays. */
export function expandDates(dateFrom: string, dateTo: string, days?: readonly Weekday[]): string[] {
  const out: string[] = [];
  const filter = days ? new Set(days) : null;
  for (let d = LocalDate.parse(dateFrom); !d.isAfter(LocalDate.parse(dateTo)); d = d.plusDays(1)) {
    const iso = d.toString();
    if (!filter || filter.has(weekdayOf(iso))) out.push(iso);
  }
  return out;
}

/** Split a sorted, unique list of ISO dates into maximal runs of consecutive days. */
export function contiguousSpans(sortedDates: readonly string[]): string[][] {
  const spans: string[][] = [];
  let current: string[] = [];
  let prev: LocalDate | null = null;
  for (const iso of sortedDates) {
    const d = LocalDate.parse(iso);
    if (prev && prev.daysUntil(d) === 1) current.push(iso);
    else {
      if (current.length) spans.push(current);
      current = [iso];
    }
    prev = d;
  }
  if (current.length) spans.push(current);
  return spans;
}
