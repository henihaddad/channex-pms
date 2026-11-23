import { describe, expect, it } from "vitest";
import { checkSellable } from "@pms/core";
import { groupSellReasons } from "./sell-reasons";

describe("groupSellReasons", () => {
  it("turns each core reason into a kind with its dates", () => {
    expect(
      groupSellReasons([
        "closed to arrival on 2026-11-24",
        "minimum stay 3 nights",
        "no availability on 2026-11-25",
        "no availability on 2026-11-24",
        "maximum stay 2 on 2026-11-24",
        "minimum stay through 4 on 2026-11-25",
      ]),
    ).toEqual([
      {
        kind: "closed_to_arrival",
        dates: ["2026-11-24"],
        n: null,
        raw: "closed to arrival on 2026-11-24",
      },
      { kind: "min_stay", dates: [], n: 3, raw: "minimum stay 3 nights" },
      {
        kind: "no_availability",
        dates: ["2026-11-24", "2026-11-25"],
        n: null,
        raw: "no availability on 2026-11-25",
      },
      { kind: "max_stay", dates: ["2026-11-24"], n: 2, raw: "maximum stay 2 on 2026-11-24" },
      {
        kind: "min_stay_through",
        dates: ["2026-11-25"],
        n: 4,
        raw: "minimum stay through 4 on 2026-11-25",
      },
    ]);
  });

  it("keeps a reason it does not know as it was", () => {
    expect(groupSellReasons(["something new"])).toEqual([
      { kind: "other", dates: [], n: null, raw: "something new" },
    ]);
  });

  it("knows every reason the core check gives", () => {
    const check = checkSellable({
      arrivalDate: "2026-11-24",
      departureDate: "2026-11-27",
      rateCells: [
        {
          date: "2026-11-24",
          values: { rate: 10000, closedToArrival: true, minStay: 5, stopSell: true },
        },
        { date: "2026-11-25", values: { rate: 10000, maxStay: 2, minStayThrough: 6 } },
        { date: "2026-11-26", values: { rate: 10000, closedToDeparture: true } },
      ] as never,
      availability: new Map([["2026-11-24", 0]]),
    });
    expect(check.ok).toBe(false);
    const kinds = groupSellReasons(check.reasons).map((r) => r.kind);
    expect(kinds).not.toContain("other");
    expect(groupSellReasons(["departure must be after arrival"])[0]!.kind).toBe(
      "departure_before_arrival",
    );
  });
});
