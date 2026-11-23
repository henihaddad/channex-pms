import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { cellOn, plural } from "./calendar-shared";

describe("plural", () => {
  it("formats the calendar's ICU plurals in each locale", () => {
    expect(plural(en.calendar.nights, { n: 1 }, "en")).toBe("1 night");
    expect(plural(en.calendar.nights, { n: 4 }, "en")).toBe("4 nights");
    expect(plural(fr.calendar.nights, { n: 1 }, "fr")).toBe("1 nuit");
    expect(plural(fr.calendar.nights, { n: 3 }, "fr")).toBe("3 nuits");
    expect(plural(ar.calendar.nights, { n: 2 }, "ar")).toBe("ليلتان");
    expect(plural(ar.calendar.nights, { n: 5 }, "ar")).toContain("ليالٍ");
    expect(plural(en.calendar.savedNights, { n: 2 }, "en")).toBe("Saved 2 nights");
  });

  it("leaves a plain placeholder message working", () => {
    expect(plural("{n} left", { n: 3 }, "en")).toBe("3 left");
  });
});

describe("cellOn", () => {
  it("finds a night's cell and indexes each array once", () => {
    const cells: Array<[string, number]> = [
      ["2026-12-24", 1],
      ["2026-12-25", 0],
    ];
    expect(cellOn(cells, "2026-12-25")?.[1]).toBe(0);
    expect(cellOn(cells, "2026-12-26")).toBeUndefined();
  });
});
