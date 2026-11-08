/**
 * The iCal export (design canvas Channels board, "iCal export for any other calendar"): the nights
 * a property cannot be sold, as all-day events, for calendars and channels that only read iCal.
 * Pure text building; the route that serves it decides which nights are closed.
 */

/** Consecutive closed nights as half-open ranges: ["2026-11-07", "2026-11-08"] → [{from: 7th, to: 9th}]. */
export function closedRanges(nights: readonly string[]): Array<{ from: string; to: string }> {
  const sorted = [...new Set(nights)].sort();
  const out: Array<{ from: string; to: string }> = [];
  const next = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && last.to === n) last.to = next(n);
    else out.push({ from: n, to: next(n) });
  }
  return out;
}

const compact = (iso: string) => iso.replaceAll("-", "");
/** RFC 5545 text escaping. */
const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
/** RFC 5545 lines fold at 75 octets; ours are short, but a long property name must not break a reader. */
const fold = (line: string) => {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
};

export function icalFeed(i: {
  calendarName: string;
  propertyId: string;
  ranges: Array<{ from: string; to: string }>;
  /** UTC instant the feed was generated, for DTSTAMP. */
  stamp: string;
  summary?: string;
}): string {
  const stamp = i.stamp.replace(/[-:]/g, "").replace(/\.\d+/, "").replace(/Z?$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OTAbridge//Calendar export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(i.calendarName)}`,
    ...i.ranges.flatMap((r) => [
      "BEGIN:VEVENT",
      `UID:${i.propertyId}-${compact(r.from)}@otabridge`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(r.from)}`,
      `DTEND;VALUE=DATE:${compact(r.to)}`,
      `SUMMARY:${esc(i.summary ?? "Not available")}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
