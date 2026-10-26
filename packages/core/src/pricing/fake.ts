import type { RateImportProvider, RateImportRow } from "./types.js";

/**
 * A pricing engine that answers from a fixed table (tests, demos, and the shape a vendor
 * adapter has to satisfy). It records what it was asked for, so a scheduled pull can be
 * proven to request the right window.
 */
export class FakeRateImportProvider implements RateImportProvider {
  readonly name = "fake";
  readonly calls: Array<{ propertyRef: string; from: string; to: string }> = [];
  constructor(private readonly rows: readonly RateImportRow[] = []) {}
  async fetchRates(input: {
    propertyRef: string;
    from: string;
    to: string;
  }): Promise<readonly RateImportRow[]> {
    this.calls.push(input);
    return this.rows.filter((r) => r.date >= input.from && r.date <= input.to);
  }
}
