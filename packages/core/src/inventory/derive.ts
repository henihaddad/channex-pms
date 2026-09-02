import type { RateCell, RestrictionValues } from "./ari.js";

/** Modifier of a derived rate plan relative to its parent (spec 06 §6.1). */
export interface DerivedOption {
  kind: "percent" | "amount";
  direction: "increase" | "decrease";
  /** Percent as integer basis points (1000 = 10 %) or an amount in minor units. */
  value: number;
}

export const MAX_DERIVATION_DEPTH = 3;

/** Apply a modifier to a parent rate in minor units, rounding half-up to the minor unit. */
export function applyDerivedOption(parentMinor: number, opt: DerivedOption): number {
  const sign = opt.direction === "increase" ? 1 : -1;
  const delta = opt.kind === "amount" ? opt.value : Math.round((parentMinor * opt.value) / 10_000);
  return Math.max(0, parentMinor + sign * delta);
}

/** Derived cells are computed, never hand-edited: rates follow the parent, restrictions are inherited unless overridden. */
export function deriveCells(
  parent: readonly RateCell[],
  childRatePlanId: string,
  opt: DerivedOption,
): RateCell[] {
  return parent.map((c) => {
    const values: RestrictionValues = { ...c.values };
    if (c.values.rate !== undefined) values.rate = applyDerivedOption(c.values.rate, opt);
    if (c.values.rates)
      values.rates = Object.fromEntries(
        Object.entries(c.values.rates).map(([occ, r]) => [occ, applyDerivedOption(r, opt)]),
      );
    return { ratePlanId: childRatePlanId, date: c.date, values };
  });
}

export interface RatePlanNode {
  id: string;
  parentRatePlanId: string | null;
}

/**
 * INV-6: a derived plan cannot be its own ancestor and the chain is at most
 * MAX_DERIVATION_DEPTH deep. Returns the ancestor chain (nearest first) or throws.
 */
export function derivationChain(
  planId: string,
  plans: ReadonlyMap<string, RatePlanNode>,
): string[] {
  const chain: string[] = [];
  let cur = plans.get(planId)?.parentRatePlanId ?? null;
  while (cur) {
    if (cur === planId || chain.includes(cur))
      throw new RangeError(`Rate plan ${planId} is its own ancestor (INV-6)`);
    chain.push(cur);
    if (chain.length > MAX_DERIVATION_DEPTH)
      throw new RangeError(
        `Rate plan ${planId} derivation deeper than ${String(MAX_DERIVATION_DEPTH)} (INV-6)`,
      );
    cur = plans.get(cur)?.parentRatePlanId ?? null;
  }
  return chain;
}

/** Children first-level to last: the order in which a parent change must re-derive (same job, spec 06 §6.1). */
export function descendants(planId: string, plans: ReadonlyMap<string, RatePlanNode>): string[] {
  const out: string[] = [];
  const queue = [planId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const p of plans.values())
      if (p.parentRatePlanId === id && !out.includes(p.id)) {
        out.push(p.id);
        queue.push(p.id);
      }
  }
  return out;
}
