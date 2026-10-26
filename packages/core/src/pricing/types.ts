import type { RateCell, RestrictionValues } from "../inventory/ari.js";

/**
 * Rate import (spec 06 §6.5b): prices computed somewhere else — PriceLabs, Wheelhouse, a
 * revenue manager's spreadsheet — brought in through one port.
 *
 * Local state stays authoritative (rule 6): an import is a proposal that goes through the
 * same guard rails, dry run and undo as a bulk edit, and is pushed to channels by the same
 * ARI path. Nothing here talks to a channel.
 *
 * Persona: the `revenue_manager` of spec 02, and the `property_manager` of a small portfolio.
 */

/**
 * The `rate_day.source` values written by us rather than by a person. Every other source
 * counts as a hand edit and holds the cell against an import for the hold window (YR-5),
 * so a new automated writer must be listed here or it will fight itself.
 */
export const AUTOMATED_RATE_SOURCES = ["seed", "derived", "horizon", "rate_import"] as const;

/** One recommendation: a price for one night on one of the engine's listings. */
export interface RateImportRow {
  /** A night, never an instant (rule 5). */
  date: string;
  /** The engine's own identifier for the listing or room type; mapped to a rate plan here. */
  listingRef: string;
  /** Minor units, integer (rule 4). */
  priceMinor: number;
  minStay?: number | null;
}

/**
 * YR-2: absolute. A recommendation outside these is refused with a reason, never clamped
 * silently — a pricing engine that wants to sell a villa for 9 € should be stopped loudly.
 */
export interface PricingGuardRails {
  floorMinor?: number | null;
  ceilingMinor?: number | null;
  /** Largest move from the current price, in basis points (2500 = 25 %). */
  maxChangeBps?: number | null;
}

export interface RateImportInput {
  rows: readonly RateImportRow[];
  /** The engine's listing reference → our rate plan id. An unmapped listing is reported. */
  mapping: ReadonlyMap<string, string>;
  /** Furthest date cells may be written (the seeded horizon end). */
  horizonEnd: string;
  guardRails?: PricingGuardRails;
  /** YR-5: a cell a human touched recently is left alone. Key `${ratePlanId}|${date}`. */
  manualEditedAt?: ReadonlyMap<string, string>;
  holdHours?: number;
  nowIso: string;
  /** Explicit override of the guard rails, recorded in the audit log (BULK-4). */
  override?: boolean;
}

export interface RefusedRow {
  row: RateImportRow;
  reason: string;
}

export interface RateImportPlan {
  changes: RateCell[];
  /** Previous values for every changed cell: applying them is the undo (BULK-2). */
  inverse: RateCell[];
  cellCount: number;
  /** Refused by a guard rail, with the reason (YR-2). */
  refused: readonly RefusedRow[];
  /** The engine priced a listing we have no rate plan for. */
  unmapped: readonly RateImportRow[];
  /** Held back because a human edited the cell inside the hold window (YR-5). */
  held: readonly RateImportRow[];
  /** Beyond the seeded horizon, so there is no cell to write. */
  outsideHorizon: readonly RateImportRow[];
  samples: Array<{
    ratePlanId: string;
    date: string;
    before: RestrictionValues;
    after: RestrictionValues;
  }>;
  warnings: string[];
}

/**
 * The port. An adapter fetches what an engine recommends for a window; everything after
 * that is ours. Implementations live outside `packages/core` — a vendor's HTTP client is a
 * plugin, the CSV reader in this module is the one that needs no vendor at all.
 */
export interface RateImportProvider {
  readonly name: string;
  fetchRates(input: {
    /** The engine's own identifier for the property, as configured per property. */
    propertyRef: string;
    from: string;
    to: string;
  }): Promise<readonly RateImportRow[]>;
}
