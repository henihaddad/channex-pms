import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { closedRanges, icalFeed } from "./ical.js";

describe("iCal export", () => {
  it("joins consecutive nights into half-open ranges", () => {
    expect(closedRanges(["2026-11-08", "2026-11-07", "2026-11-10", "2026-11-07"])).toEqual([
      { from: "2026-11-07", to: "2026-11-09" },
      { from: "2026-11-10", to: "2026-11-11" },
    ]);
    expect(closedRanges(["2026-12-31", "2027-01-01"])).toEqual([
      { from: "2026-12-31", to: "2027-01-02" },
    ]);
  });

  it("covers exactly the closed nights, never one more", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 120 }), { maxLength: 40 }),
        (offsets) => {
          const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
          const nights = offsets.map(day);
          const covered: string[] = [];
          for (const r of closedRanges(nights))
            for (
              let d = r.from;
              d < r.to;
              d = day((Date.parse(d) - Date.UTC(2026, 10, 1)) / 86_400_000 + 1)
            )
              covered.push(d);
          expect(covered.sort()).toEqual([...nights].sort());
        },
      ),
    );
  });

  it("writes an RFC 5545 calendar with all-day events", () => {
    const text = icalFeed({
      calendarName: "Alfama Loft, Lisbon",
      propertyId: "p1",
      ranges: [{ from: "2026-11-07", to: "2026-11-09" }],
      stamp: "2026-11-08T12:00:00.000Z",
    });
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("X-WR-CALNAME:Alfama Loft\\, Lisbon\r\n");
    expect(text).toContain("DTSTART;VALUE=DATE:20261107\r\nDTEND;VALUE=DATE:20261109\r\n");
    expect(text).toContain("DTSTAMP:20261108T120000Z\r\n");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("escapes semicolons in text values", () => {
    const text = icalFeed({
      calendarName: "Loft; Lisbon",
      propertyId: "p1",
      ranges: [],
      stamp: "2026-11-08T12:00:00Z",
    });
    expect(text).toContain("X-WR-CALNAME:Loft\\; Lisbon\r\n");
  });
});
