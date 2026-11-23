/** "March 2026" in the owner's language, from a statement period's first day (a UTC calendar month). */
export function periodLabel(periodFrom: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${periodFrom.slice(0, 10)}T00:00:00Z`));
}
