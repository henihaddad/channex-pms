import { describe, expect, it } from "vitest";
import { FakeClock } from "../shared/clock.js";
import { Id } from "../shared/id.js";
import type { PropertyRepository } from "./ports.js";
import { createProperty, fromCsvRow, fromTemplate } from "./service.js";

function memoryRepo() {
  const calls: Record<string, unknown[]> = {
    property: [],
    groups: [],
    roomTypes: [],
    units: [],
    ratePlans: [],
    cells: [],
    availability: [],
    webhook: [],
  };
  const repo: PropertyRepository = {
    insertProperty: async (p) => {
      calls.property!.push(p);
    },
    addToGroups: async (id, g) => {
      calls.groups!.push([id, g]);
    },
    insertRoomType: async (rt) => {
      calls.roomTypes!.push(rt);
    },
    insertUnit: async (u) => {
      calls.units!.push(u);
    },
    insertRatePlan: async (rp) => {
      calls.ratePlans!.push(rp);
    },
    seedRateCells: async (_p, cells) => {
      calls.cells!.push(...cells);
    },
    seedAvailability: async (_p, rt, from, days, available) => {
      calls.availability!.push({ rt, from, days, available });
    },
    setWebhookCredentials: async (id, token, secret) => {
      calls.webhook!.push({ id, token, secret });
    },
  };
  return { repo, calls };
}

const deps = (repo: PropertyRepository) => ({
  repo,
  clock: new FakeClock("2026-09-02T12:00:00Z"),
  orgId: Id.next(),
  horizonDays: 30,
  webhookCredentials: async () => ({ token: "t", secretSealed: "s" }),
});

describe("createProperty", () => {
  it("single_unit: exactly one system-managed room type and unit, seeded horizon (MODEL-1, INV-11)", async () => {
    const { repo, calls } = memoryRepo();
    const r = await createProperty(deps(repo), {
      title: "Alfama 2B",
      kind: "single_unit",
      currency: "EUR",
      timezone: "Europe/Lisbon",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.roomTypes).toHaveLength(1);
    expect(r.value.roomTypes[0]).toMatchObject({
      countOfRooms: 1,
      isSystemManaged: true,
      title: "Alfama 2B",
    });
    expect(r.value.units).toHaveLength(1);
    expect(r.value.ratePlans).toHaveLength(1);
    expect(r.value.seededCells).toBe(30);
    expect(calls.cells![0]).toMatchObject({
      date: "2026-09-02",
      values: { rate: 10000, minStay: 1 },
    });
    expect(calls.availability![0]).toMatchObject({ days: 30, available: 1 });
    expect(calls.webhook).toHaveLength(1);
  });

  it("hotel: room types with numbered units and named rate plans per room type", async () => {
    const { repo } = memoryRepo();
    const r = await createProperty(deps(repo), {
      title: "Hotel",
      kind: "hotel",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      roomTypes: [
        { title: "Double", countOfRooms: 3, occAdults: 2, occChildren: 1 },
        { title: "Suite", countOfRooms: 1, occAdults: 3, occChildren: 1, unitNames: ["Penthouse"] },
      ],
      ratePlans: [
        { title: "BAR", roomTypeTitle: "Double", baseRateMinor: 12000 },
        { title: "BAR", roomTypeTitle: "Suite", baseRateMinor: 30000 },
      ],
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.units.map((u) => u.name)).toEqual([
      "Double 1",
      "Double 2",
      "Double 3",
      "Penthouse",
    ]);
    expect(r.value.ratePlans.map((p) => p.roomTypeId)).toEqual([
      r.value.roomTypes[0]!.id,
      r.value.roomTypes[1]!.id,
    ]);
    expect(r.value.roomTypes.every((rt) => !rt.isSystemManaged)).toBe(true);
  });

  it("rejects a multi_unit without room types and bad currency", async () => {
    const { repo } = memoryRepo();
    expect(
      (
        await createProperty(deps(repo), {
          title: "x",
          kind: "multi_unit",
          currency: "EUR",
          timezone: "UTC",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createProperty(deps(repo), {
          title: "x",
          kind: "single_unit",
          currency: "euro",
          timezone: "UTC",
        })
      ).ok,
    ).toBe(false);
  });

  it("templates and CSV rows produce inputs", () => {
    const t = {
      id: Id.next(),
      name: "City flat",
      payload: {
        kind: "single_unit" as const,
        currency: "EUR",
        timezone: "Europe/Lisbon",
        ratePlans: [{ title: "Standard", baseRateMinor: 9000 }],
      },
    };
    expect(fromTemplate(t, { title: "Chiado Loft" })).toMatchObject({
      title: "Chiado Loft",
      kind: "single_unit",
      currency: "EUR",
    });
    const row = fromCsvRow(
      { title: "Lagos Villa", kind: "single_unit", base_rate: "150.50", city: "Lagos" },
      { currency: "EUR", timezone: "Europe/Lisbon" },
    );
    expect(row.ok && row.value.ratePlans?.[0]?.baseRateMinor).toBe(15050);
    expect(fromCsvRow({ title: "" }, { currency: "EUR", timezone: "UTC" }).ok).toBe(false);
  });
});
