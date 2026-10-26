import { eq, sql } from "drizzle-orm";
import type { PricingGuardRails } from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface RateImportSettings {
  propertyId: string;
  provider: string;
  providerRef: string | null;
  enabled: boolean;
  autoApply: boolean;
  guardRails: PricingGuardRails;
  holdHours: number;
  /** The engine's listing reference → one of this property's rate plan ids. */
  mapping: Record<string, string>;
  lastRunAt: string | null;
  lastError: string | null;
}

export const DEFAULT_RATE_IMPORT: Omit<RateImportSettings, "propertyId"> = {
  provider: "csv",
  providerRef: null,
  enabled: false,
  autoApply: false,
  guardRails: { floorMinor: null, ceilingMinor: null, maxChangeBps: null },
  holdHours: 48,
  mapping: {},
  lastRunAt: null,
  lastError: null,
};

/** Per-property rate import settings (spec 06 §6.5b). */
export class DrizzleRateImportRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  async get(propertyId: string): Promise<RateImportSettings> {
    const [r] = await this.tx
      .select()
      .from(s.rateImportSettings)
      .where(eq(s.rateImportSettings.propertyId, propertyId))
      .limit(1);
    if (!r) return { propertyId, ...DEFAULT_RATE_IMPORT };
    return {
      propertyId,
      provider: r.provider,
      providerRef: r.providerRef,
      enabled: r.enabled,
      autoApply: r.autoApply,
      guardRails: {
        floorMinor: r.floorMinor,
        ceilingMinor: r.ceilingMinor,
        maxChangeBps: r.maxChangeBps,
      },
      holdHours: r.holdHours,
      mapping: r.mapping,
      lastRunAt: r.lastRunAt,
      lastError: r.lastError,
    };
  }

  async save(propertyId: string, next: Omit<RateImportSettings, "propertyId">): Promise<void> {
    const values = {
      propertyId,
      orgId: this.orgId,
      provider: next.provider,
      providerRef: next.providerRef,
      enabled: next.enabled,
      autoApply: next.autoApply,
      floorMinor: next.guardRails.floorMinor ?? null,
      ceilingMinor: next.guardRails.ceilingMinor ?? null,
      maxChangeBps: next.guardRails.maxChangeBps ?? null,
      holdHours: next.holdHours,
      mapping: next.mapping,
      updatedAt: new Date().toISOString(),
    };
    await this.tx
      .insert(s.rateImportSettings)
      .values(values)
      .onConflictDoUpdate({ target: s.rateImportSettings.propertyId, set: values });
  }

  /** What a run leaves behind, so the page can say when it last worked and why it did not. */
  async recordRun(propertyId: string, at: string, error: string | null): Promise<void> {
    await this.tx
      .update(s.rateImportSettings)
      .set({ lastRunAt: at, lastError: error })
      .where(eq(s.rateImportSettings.propertyId, propertyId));
  }

  /** Properties with a scheduled pull switched on, for the worker. */
  async scheduled(): Promise<Array<{ propertyId: string; orgId: string }>> {
    return rawRows<{ propertyId: string; orgId: string }>(
      this.tx,
      sql`select property_id as "propertyId", org_id as "orgId"
          from rate_import_settings where enabled and provider <> 'csv'`,
    );
  }
}
