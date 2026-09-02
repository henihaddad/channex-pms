import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  allocateOverNights,
  computeStatement,
  periodEndingBefore,
  restatementAdjustments,
} from "./statement.js";
import type { AgreementTerms, StatementInput, StatementNight } from "./types.js";

const agreement = (over: Partial<AgreementTerms> = {}): AgreementTerms => ({
  id: "agr-1",
  version: 1,
  ownerId: "own-1",
  propertyId: "prop-1",
  unitIds: null,
  model: { kind: "commission_pct", rateBps: 2000 },
  commissionBasis: "net_of_ota_commission",
  deductibles: {
    maintenance: { kind: "marked_up", markupBps: 1000 },
    consumables: { kind: "absorbed" },
  },
  cleaningFees: { kind: "kept" },
  ownerStays: { kind: "free" },
  ownerStayAllowanceNights: null,
  payout: { frequency: "monthly", dayOfMonth: 5, minimumMinor: 0, holdBackBps: 0 },
  vat: { onFee: false, rateBps: 0 },
  currency: "EUR",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  ...over,
});
const night = (date: string, over: Partial<StatementNight> = {}): StatementNight => ({
  bookingId: "b1",
  roomKey: "r1",
  date,
  unitId: "u1",
  amountMinor: 10000,
  otaCommissionMinor: 1500,
  otaCommissionKind: "actual",
  withheldTaxMinor: 0,
  cleaningFeeMinor: 0,
  channel: "booking_com",
  guestLabel: "Ana S.",
  arrivalDate: "2026-03-30",
  departureDate: "2026-04-03",
  ...over,
});
const base = (over: Partial<StatementInput> = {}): StatementInput => ({
  period: { from: "2026-04-01", to: "2026-05-01" },
  currency: "EUR",
  segments: [agreement()],
  nights: [],
  expenses: [],
  ownerStays: [],
  adjustments: [],
  holdBackReleasedMinor: 0,
  ownerStayNightsUsedBefore: 0,
  ...over,
});
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("computeStatement", () => {
  it("STMT-3: a stay spanning the month boundary is attributed by night; the fee follows the basis", () => {
    const r = computeStatement(
      base({
        nights: ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"].map((d) => night(d)),
      }),
    );
    expect(r.lines.filter((l) => l.kind === "booking_revenue")).toHaveLength(2);
    expect(r.totals.grossRevenue).toBe(20000);
    expect(r.totals.otaCommission).toBe(3000);
    expect(r.totals.revenueBasis).toBe(17000);
    expect(r.totals.managementFee).toBe(3400);
    expect(r.totals.netDue).toBe(20000 - 3000 - 3400);
    expect(r.totals.netDue).toBe(sum(r.lines.map((l) => l.amountMinor)));
  });

  it("AGR-1: a mid-month version change yields two labelled segments", () => {
    const v1 = agreement({ effectiveTo: "2026-04-16" });
    const v2 = agreement({
      id: "agr-2",
      version: 2,
      effectiveFrom: "2026-04-16",
      model: { kind: "commission_pct", rateBps: 1500 },
      commissionBasis: "gross",
    });
    const r = computeStatement(
      base({
        segments: [v1, v2],
        nights: [night("2026-04-10"), night("2026-04-20", { bookingId: "b2", roomKey: "r2" })],
      }),
    );
    expect(r.segments.map((s) => [s.version, s.from, s.to, s.nights])).toEqual([
      [1, "2026-04-01", "2026-04-16", 1],
      [2, "2026-04-16", "2026-05-01", 1],
    ]);
    const fees = r.lines.filter((l) => l.kind === "management_fee");
    expect(fees.map((f) => [f.agreementVersion, f.amountMinor])).toEqual([
      [1, -1700],
      [2, -1500],
    ]);
  });

  it("EXP-2: markup is its own line; absorbed categories never reach the owner", () => {
    const r = computeStatement(
      base({
        expenses: [
          {
            id: "e1",
            date: "2026-04-05",
            category: "maintenance",
            description: "Boiler",
            amountMinor: 5000,
            vendor: "Gas Co",
            hasReceipt: true,
          },
          {
            id: "e2",
            date: "2026-04-06",
            category: "consumables",
            description: "Soap",
            amountMinor: 800,
            vendor: null,
            hasReceipt: false,
          },
        ],
      }),
    );
    expect(r.lines.map((l) => [l.kind, l.amountMinor])).toEqual([
      ["expense", -5000],
      ["expense_markup", -500],
    ]);
    expect(r.totals.expenses).toBe(5500);
  });

  it("owner stays: free within the allowance, charged beyond it; hold-back and minimum payout are itemised (PAY-3)", () => {
    const r = computeStatement(
      base({
        segments: [
          agreement({
            ownerStays: { kind: "rate", nightlyMinor: 4000 },
            ownerStayAllowanceNights: 2,
            payout: {
              frequency: "monthly",
              dayOfMonth: 1,
              minimumMinor: 100000,
              holdBackBps: 1000,
            },
          }),
        ],
        nights: [night("2026-04-10"), night("2026-04-11")],
        ownerStays: [
          { blockId: "k1", date: "2026-04-12", unitId: "u1" },
          { blockId: "k1", date: "2026-04-13", unitId: "u1" },
          { blockId: "k1", date: "2026-04-14", unitId: "u1" },
        ],
        ownerStayNightsUsedBefore: 1,
      }),
    );
    const stays = r.lines.filter((l) => l.kind === "owner_stay").map((l) => l.amountMinor);
    expect(stays).toEqual([0, -4000, -4000]);
    const hb = r.lines.find((l) => l.kind === "hold_back")!;
    expect(hb.amountMinor).toBe(-Math.round((20000 - 3000 - 3400 - 8000) * 0.1));
    expect(r.totals.payable).toBe(0);
    expect(r.totals.carriedForward).toBe(r.totals.netDue);
    expect(r.warnings.some((w) => w.includes("minimum payout"))).toBe(true);
  });

  it("guaranteed rent: the owner nets the rent; the manager's share is an explained fee line", () => {
    const r = computeStatement(
      base({
        segments: [
          agreement({
            model: { kind: "guaranteed_rent", amountMinor: 150000 },
            commissionBasis: "gross",
          }),
        ],
        nights: [
          night("2026-04-01", { otaCommissionMinor: 0, otaCommissionKind: "none" }),
          night("2026-04-02", { otaCommissionMinor: 0, otaCommissionKind: "none" }),
        ],
      }),
    );
    expect(r.totals.netDue).toBe(150000);
    // the manager covers the shortfall: the "fee" line is positive when revenue is below the rent
    expect(r.lines.find((l) => l.kind === "management_fee")!.amountMinor).toBe(150000 - 20000);
  });

  it("STMT-4: restatement after a sent statement produces a linked negative adjustment", () => {
    const adj = restatementAdjustments(
      [
        {
          statementId: "st-march",
          bookingId: "b1",
          roomKey: "r1",
          date: "2026-03-30",
          amountMinor: 10000,
        },
      ],
      [{ roomKey: "r1", date: "2026-03-30", amountMinor: 10000, status: "cancelled" }],
      "2026-04-30",
    );
    expect(adj).toEqual([
      expect.objectContaining({
        kind: "restatement",
        amountMinor: -10000,
        originStatementId: "st-march",
        originBookingId: "b1",
      }),
    ]);
    const r = computeStatement(
      base({ adjustments: adj.map((a) => ({ ...a, kind: "restatement" as const })) }),
    );
    expect(r.totals.adjustments).toBe(-10000);
    expect(r.lines[0]!.adjustmentId).toBe(adj[0]!.id);
  });

  it("periods: monthly and fortnightly windows ending before today", () => {
    expect(periodEndingBefore("monthly", "2026-05-03")).toEqual({
      from: "2026-04-01",
      to: "2026-05-01",
    });
    expect(periodEndingBefore("fortnightly", "2026-05-03")).toEqual({
      from: "2026-04-16",
      to: "2026-05-01",
    });
    expect(periodEndingBefore("fortnightly", "2026-05-20")).toEqual({
      from: "2026-05-01",
      to: "2026-05-16",
    });
  });
});

const uniqueNights = (ns: StatementNight[]): StatementNight[] => {
  const seen = new Set<string>();
  return ns.filter((n) => {
    const k = `${n.roomKey}:${n.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const arbNight = fc
  .record({
    bookingId: fc.integer({ min: 1, max: 40 }).map((n) => `b${String(n)}`),
    day: fc.integer({ min: 1, max: 60 }),
    amountMinor: fc.integer({ min: 0, max: 50_000 }),
    commission: fc.integer({ min: 0, max: 8_000 }),
    withheld: fc.integer({ min: 0, max: 3_000 }),
    kind: fc.constantFrom("actual", "estimate", "none"),
    cleaning: fc.integer({ min: 0, max: 6_000 }),
  })
  .map((x) => {
    const d = new Date(Date.UTC(2026, 2, x.day));
    return night(d.toISOString().slice(0, 10), {
      bookingId: x.bookingId,
      roomKey: `${x.bookingId}-r`,
      amountMinor: x.amountMinor,
      otaCommissionMinor: x.kind === "none" ? 0 : x.commission,
      otaCommissionKind: x.kind,
      withheldTaxMinor: x.withheld,
      cleaningFeeMinor: x.cleaning,
    });
  });
interface Terms {
  rateBps: number;
  basis: AgreementTerms["commissionBasis"];
  cleaning: AgreementTerms["cleaningFees"];
  holdBackBps: number;
  vat: boolean;
  markupBps: number;
}
interface Expense {
  id: string;
  day: number;
  category: "cleaning" | "consumables" | "maintenance" | "linen" | "other";
  amountMinor: number;
}
const arbTerms: fc.Arbitrary<Terms> = fc.record({
  rateBps: fc.integer({ min: 0, max: 5000 }),
  basis: fc.constantFrom("gross", "net_of_ota_commission", "net_of_tax"),
  cleaning: fc.constantFrom(
    { kind: "kept" },
    { kind: "passed" },
    { kind: "split", ownerBps: 5000 },
  ),
  holdBackBps: fc.integer({ min: 0, max: 2000 }),
  vat: fc.boolean(),
  markupBps: fc.integer({ min: 0, max: 3000 }),
});
const arbExpense: fc.Arbitrary<Expense> = fc.record({
  id: fc.uuid(),
  day: fc.integer({ min: 1, max: 30 }),
  category: fc.constantFrom("cleaning", "consumables", "maintenance", "linen", "other"),
  amountMinor: fc.integer({ min: 0, max: 100_000 }),
});

describe("statement arithmetic (property-based, OWN-1, spec 17 §17.7)", () => {
  const inputFrom = (nights: StatementNight[], terms: Terms, expenses: Expense[]) =>
    base({
      segments: [
        agreement({
          model: { kind: "commission_pct", rateBps: terms.rateBps },
          commissionBasis: terms.basis,
          cleaningFees: terms.cleaning,
          payout: {
            frequency: "monthly",
            dayOfMonth: 1,
            minimumMinor: 0,
            holdBackBps: terms.holdBackBps,
          },
          vat: { onFee: terms.vat, rateBps: 2300 },
          deductibles: {
            maintenance: { kind: "marked_up", markupBps: terms.markupBps },
            consumables: { kind: "absorbed" },
          },
        }),
      ],
      nights,
      expenses: expenses.map((e) => ({
        id: e.id,
        date: `2026-04-${String(e.day).padStart(2, "0")}`,
        category: e.category,
        description: "x",
        amountMinor: e.amountMinor,
        vendor: null,
        hasReceipt: true,
      })),
    });

  it("every line sums to the net due; only nights in the period appear; regeneration is byte-identical", () => {
    fc.assert(
      fc.property(
        fc.array(arbNight, { maxLength: 60 }),
        arbTerms,
        fc.array(arbExpense, { maxLength: 8 }),
        (nights, terms, expenses) => {
          const input = inputFrom(nights, terms, expenses);
          const r = computeStatement(input);
          expect(sum(r.lines.map((l) => l.amountMinor))).toBe(r.totals.netDue);
          for (const l of r.lines)
            expect(l.date >= "2026-04-01" && l.date <= "2026-04-30").toBe(true);
          const inPeriod = nights.filter(
            (n) => n.date >= "2026-04-01" && n.date < "2026-05-01",
          ).length;
          expect(r.lines.filter((l) => l.kind === "booking_revenue")).toHaveLength(inPeriod);
          expect(
            JSON.stringify(computeStatement(JSON.parse(JSON.stringify(input)) as StatementInput)),
          ).toBe(JSON.stringify(r));
          const shuffled = {
            ...input,
            nights: [...input.nights].reverse(),
            expenses: [...input.expenses].reverse(),
          };
          expect(JSON.stringify(computeStatement(shuffled))).toBe(JSON.stringify(r));
        },
      ),
      { numRuns: 300 },
    );
  });

  it("no night is paid twice across consecutive statements: March and April partition every night", () => {
    fc.assert(
      fc.property(
        fc.array(arbNight, { maxLength: 60 }).map(uniqueNights),
        arbTerms,
        (nights, terms) => {
          const march = computeStatement({
            ...inputFrom(nights, terms, []),
            period: { from: "2026-03-01", to: "2026-04-01" },
          });
          const april = computeStatement(inputFrom(nights, terms, []));
          const key = (l: { bookingId: string | null; date: string }) =>
            `${l.bookingId ?? ""}:${l.date}`;
          const a = march.lines.filter((l) => l.kind === "booking_revenue").map(key);
          const b = april.lines.filter((l) => l.kind === "booking_revenue").map(key);
          expect(new Set(a.filter((k) => b.includes(k))).size).toBe(0);
          expect(a.length + b.length).toBe(nights.length);
          expect(march.totals.grossRevenue + april.totals.grossRevenue).toBe(
            sum(nights.map((n) => n.amountMinor)),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("allocating a booking-level amount over nights is exact", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.array(fc.integer({ min: 0, max: 20000 }), { minLength: 1, maxLength: 10 }),
        (total, amounts) => {
          const parts = allocateOverNights(total, amounts, "EUR");
          expect(parts).toHaveLength(amounts.length);
          expect(sum(parts)).toBe(total);
        },
      ),
    );
  });
});
