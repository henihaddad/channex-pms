import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  defaultPaymentRules,
  planPayments,
  uncoveredMinor,
  type PaymentRule,
} from "./payment-rules.js";

const rule = (over: Partial<PaymentRule> & { id: string }): PaymentRule => ({
  name: over.id,
  trigger: "confirmation",
  offsetDays: 0,
  amount: { kind: "remainder" },
  propertyIds: [],
  channels: [],
  enabled: true,
  position: 0,
  ...over,
});

const base = {
  totalMinor: 100_000,
  currency: "EUR",
  propertyId: "p1",
  channel: "direct",
  arrival: "2026-10-20",
  bookedOn: "2026-09-01",
};

describe("payment rules (spec 10 §10.4)", () => {
  it("splits a deposit at confirmation and the remainder before arrival", () => {
    const plan = planPayments({
      ...base,
      rules: [
        rule({ id: "a", amount: { kind: "percent", percentBps: 3000 }, position: 0 }),
        rule({
          id: "b",
          trigger: "before_arrival",
          offsetDays: 14,
          amount: { kind: "remainder" },
          position: 1,
        }),
      ],
    });
    expect(plan).toEqual([
      { ruleId: "a", name: "a", dueOn: "2026-09-01", amountMinor: 30_000 },
      { ruleId: "b", name: "b", dueOn: "2026-10-06", amountMinor: 70_000 },
    ]);
  });

  it("a moment already past is due on the day of booking, never earlier", () => {
    const plan = planPayments({
      ...base,
      bookedOn: "2026-10-15",
      rules: [rule({ id: "a", trigger: "before_arrival", offsetDays: 30 })],
    });
    expect(plan[0]?.dueOn).toBe("2026-10-15");
  });

  it("skips rules scoped to another property or channel", () => {
    const rules = [
      rule({ id: "a", propertyIds: ["other"] }),
      rule({ id: "b", channels: ["AirBNB"] }),
      rule({ id: "c", enabled: false }),
    ];
    expect(planPayments({ ...base, rules })).toEqual([]);
    expect(uncoveredMinor({ ...base, rules })).toBe(100_000);
  });

  it("a fixed amount larger than the stay takes the stay, not more", () => {
    const plan = planPayments({
      ...base,
      totalMinor: 5_000,
      rules: [rule({ id: "a", amount: { kind: "fixed", amountMinor: 20_000 } })],
    });
    expect(plan).toEqual([{ ruleId: "a", name: "a", dueOn: "2026-09-01", amountMinor: 5_000 }]);
  });

  it("the default catalogue collects the whole stay at confirmation", () => {
    const plan = planPayments({ ...base, rules: defaultPaymentRules((n) => `r${String(n)}`) });
    expect(plan).toEqual([
      {
        ruleId: "r0",
        name: "Collect 100% at booking confirmation",
        dueOn: "2026-09-01",
        amountMinor: 100_000,
      },
    ]);
  });

  it("instalments never exceed the total, and a remainder rule always closes it exactly", () => {
    const amount = fc.oneof(
      fc.integer({ min: 0, max: 10_000 }).map((percentBps) => ({
        kind: "percent" as const,
        percentBps,
      })),
      fc.integer({ min: 0, max: 200_000 }).map((amountMinor) => ({
        kind: "fixed" as const,
        amountMinor,
      })),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(amount, { maxLength: 6 }),
        fc.boolean(),
        (totalMinor, amounts, closeWithRemainder) => {
          const rules = amounts.map((a, i) =>
            rule({ id: `r${String(i)}`, amount: a, position: i }),
          );
          if (closeWithRemainder)
            rules.push(rule({ id: "last", amount: { kind: "remainder" }, position: 99 }));
          const plan = planPayments({ ...base, totalMinor, rules });
          const sum = plan.reduce((n, i) => n + i.amountMinor, 0);
          expect(sum).toBeLessThanOrEqual(totalMinor);
          expect(plan.every((i) => i.amountMinor > 0)).toBe(true);
          if (closeWithRemainder) expect(sum).toBe(totalMinor);
          expect(uncoveredMinor({ ...base, totalMinor, rules })).toBe(totalMinor - sum);
        },
      ),
    );
  });

  it("instalments come back in due order", () => {
    const plan = planPayments({
      ...base,
      rules: [
        rule({
          id: "late",
          trigger: "after_arrival",
          offsetDays: 1,
          amount: { kind: "percent", percentBps: 2000 },
          position: 0,
        }),
        rule({
          id: "early",
          trigger: "before_arrival",
          offsetDays: 30,
          amount: { kind: "percent", percentBps: 2000 },
          position: 1,
        }),
      ],
    });
    expect(plan.map((i) => i.ruleId)).toEqual(["early", "late"]);
  });
});
