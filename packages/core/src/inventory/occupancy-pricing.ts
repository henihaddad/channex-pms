/**
 * Occupancy pricing (spec 06 §6.1): three editor modes expanded into the
 * `rates[]` per-occupancy shape Channex accepts at push time.
 */
export type OccupancyPricing =
  | { mode: "flat" }
  | { mode: "table"; rates: Record<number, number> }
  | {
      mode: "base_delta";
      baseOccupancy: number;
      extraAdultMinor: number;
      extraChildMinor?: number;
      fewerAdultMinor?: number;
    };

/** Expand a flat rate (minor units) into per-occupancy rates for occupancies 1..max. */
export function expandOccupancyRates(
  rateMinor: number,
  pricing: OccupancyPricing,
  maxOccupancy: number,
): Record<number, number> | undefined {
  switch (pricing.mode) {
    case "flat":
      return undefined;
    case "table":
      return Object.fromEntries(
        Object.entries(pricing.rates)
          .filter(([o]) => Number(o) >= 1 && Number(o) <= maxOccupancy)
          .map(([o, r]) => [Number(o), r]),
      );
    case "base_delta": {
      const out: Record<number, number> = {};
      for (let occ = 1; occ <= maxOccupancy; occ++) {
        const diff = occ - pricing.baseOccupancy;
        const delta =
          diff >= 0 ? diff * pricing.extraAdultMinor : -diff * (pricing.fewerAdultMinor ?? 0) * -1;
        out[occ] = Math.max(0, rateMinor + (diff >= 0 ? delta : -Math.abs(delta)));
      }
      return out;
    }
  }
}
