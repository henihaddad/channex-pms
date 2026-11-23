import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { presetDate, snoozeUntil, zonedToday } from "./snooze";

describe("snooze", () => {
  it("reads today on the property's calendar, not the server's", () => {
    // 23:30 UTC on Sunday 22 Nov is already Monday morning in Auckland
    const now = new Date("2026-11-22T23:30:00Z");
    expect(zonedToday(now, "UTC")).toBe("2026-11-22");
    expect(zonedToday(now, "Pacific/Auckland")).toBe("2026-11-23");
  });

  it("wakes tomorrow at 09:00 property time", () => {
    const now = new Date("2026-11-23T20:00:00Z");
    expect(snoozeUntil({ preset: "tomorrow" }, now, "Europe/Lisbon")).toBe(
      "2026-11-24T09:00:00.000Z",
    );
    expect(snoozeUntil({ preset: "tomorrow" }, now, "Europe/Paris")).toBe(
      "2026-11-24T08:00:00.000Z",
    );
  });

  it("next week is the coming Monday, never today", () => {
    // Monday 23 Nov 2026 → Monday 30 Nov; Sunday 29 Nov → Monday 30 Nov
    expect(presetDate("next_week", new Date("2026-11-23T10:00:00Z"), "UTC")).toBe("2026-11-30");
    expect(presetDate("next_week", new Date("2026-11-29T10:00:00Z"), "UTC")).toBe("2026-11-30");
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3650 }), (offset) => {
        const now = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
        const d = presetDate("next_week", now, "UTC");
        const gap =
          (Date.parse(`${d}T00:00:00Z`) - Date.parse(zonedToday(now, "UTC"))) / 86_400_000;
        return new Date(`${d}T00:00:00Z`).getUTCDay() === 1 && gap >= 1 && gap <= 7;
      }),
    );
  });

  it("reads a typed time in the property's zone and clears on nothing", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(snoozeUntil({ until: "2026-12-01T14:30" }, now, "America/New_York")).toBe(
      "2026-12-01T19:30:00.000Z",
    );
    expect(snoozeUntil({ until: "" }, now, "UTC")).toBeNull();
    expect(snoozeUntil({ preset: "someday" }, now, "UTC")).toBeNull();
  });
});
