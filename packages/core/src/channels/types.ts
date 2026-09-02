import type { DerivedOption } from "../inventory/derive.js";

/** Connection lifecycle (spec 07 §7.2, CH-4): created inactive, activated only after readiness passes. */
export type ConnectionState =
  "draft" | "testing" | "mapped" | "active" | "paused" | "error" | "removed";

export type ConnectionEvent =
  | "test_ok"
  | "test_failed"
  | "mappings_saved"
  | "readiness_ok"
  | "readiness_failed"
  | "activated"
  | "paused"
  | "resumed"
  | "provider_error"
  | "recovered"
  | "removed";

/** One row of the mapping screen (spec 07 §7.3). */
export interface MappingRow {
  ratePlanId: string;
  roomCode: string;
  rateCode: string;
  occupancy?: number;
  rateType?: string;
  derivedOption?: DerivedOption;
}

/** Our side of the mapping screen: rate plans with the context needed for suggestions and validation. */
export interface OurRatePlan {
  id: string;
  title: string;
  propertyId: string;
  roomTypeId: string;
  roomTypeTitle: string;
  occupancy: number;
  isDerived: boolean;
}

/** The channel's side, as returned by the provider's mapping details call. */
export interface TheirRoom {
  code: string;
  title: string;
  rates: Array<{ code: string; title: string; occupancy?: number }>;
}

export interface Suggestion extends MappingRow {
  /** 0..1; suggestions are reviewable, never auto-applied above 1 (MAP-1). */
  confidence: number;
  reasons: string[];
}

export type CoverageCode =
  | "unmapped_room_type"
  | "unmapped_rate_plan"
  | "channel_room_unmapped"
  | "occupancy_gap"
  | "duplicate_target";

export interface CoverageWarning {
  code: CoverageCode;
  message: string;
  ref: string;
}

export type MappingErrorCode =
  "cross_property" | "unknown_rate_plan" | "unknown_channel_target" | "derived_where_base_expected";

export interface MappingError {
  code: MappingErrorCode;
  message: string;
  ratePlanId: string;
}

export interface MappingDiff {
  startsSelling: MappingRow[];
  stopsSelling: MappingRow[];
  changed: Array<{ before: MappingRow; after: MappingRow }>;
}
