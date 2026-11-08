import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { day, elapsed, money, nightsBetween, percent, stay } from "./format";

describe("format", () => {
  it("writes money as the design does", () => {
    expect(money(8000, "EUR")).toBe("€80");
    expect(money(8050, "EUR")).toBe("€80.50");
    expect(money(164000, "EUR")).toBe("€1,640");
    expect(money(45000, "ZAR")).toBe("ZAR 450");
    expect(money(-2500, "GBP")).toBe("−£25");
    expect(money(null, "EUR")).toBe("—");
  });
  it("never loses the minor units it was given", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (minor) => {
        const digits = Number(money(minor, "EUR").replace(/[^0-9]/g, ""));
        expect(digits).toBe(minor % 100 === 0 ? minor / 100 : minor);
      }),
    );
  });
  it("writes percentages and dates", () => {
    expect(percent(0.824)).toBe("82%");
    expect(percent(25, { ratio: false })).toBe("25%");
    expect(day("2026-11-14")).toBe("Sat 14 Nov");
    expect(stay("2026-11-14", "2026-11-17")).toMatch(/14 → .* 17 Nov$/);
    expect(stay("2026-11-30", "2026-12-02")).toMatch(/30 Nov → .* 2 Dec$/);
    expect(nightsBetween("2026-11-14", "2026-11-17")).toBe(3);
  });
  it("writes elapsed time", () => {
    const now = new Date("2026-11-08T12:00:00Z");
    expect(elapsed("2026-11-08T11:48:00Z", now)).toBe("12 min");
    expect(elapsed("2026-11-08T10:48:00Z", now)).toBe("1 h 12 min");
    expect(elapsed("2026-11-05T12:00:00Z", now)).toBe("3 d");
  });
});
