import type { Id } from "../shared/id.js";

export type PropertyKind = "single_unit" | "multi_unit" | "hotel";
export type PropertyState = "draft" | "syncing" | "live" | "suspended" | "archived";

export interface PropertyInput {
  title: string;
  kind: PropertyKind;
  currency: string;
  timezone: string;
  address?: Record<string, string>;
  groupIds?: Id[];
  /** For multi_unit and hotel: the room types to create. Ignored for single_unit (MODEL-1). */
  roomTypes?: Array<{
    title: string;
    countOfRooms: number;
    occAdults: number;
    occChildren: number;
    unitNames?: string[];
  }>;
  ratePlans?: Array<{
    title: string;
    roomTypeTitle?: string;
    baseRateMinor: number;
    minStay?: number;
  }>;
  settings?: Record<string, unknown>;
}

export interface PropertyRecord {
  id: Id;
  orgId: Id;
  kind: PropertyKind;
  title: string;
  currency: string;
  timezone: string;
  state: PropertyState;
}

export interface RoomTypeRecord {
  id: Id;
  propertyId: Id;
  title: string;
  countOfRooms: number;
  occAdults: number;
  occChildren: number;
  occInfants: number;
  maxOccupancy: number;
  defaultOccupancy: number;
  isSystemManaged: boolean;
}

export interface UnitRecord {
  id: Id;
  propertyId: Id;
  roomTypeId: Id;
  name: string;
  isSystemManaged: boolean;
}

export interface RatePlanRecord {
  id: Id;
  propertyId: Id;
  roomTypeId: Id;
  title: string;
  currency: string;
  parentRatePlanId: Id | null;
}

/** A saved property bundle: room types, rate plans, policies, mapping hints (spec 03 §3.2). */
export interface PropertyTemplate {
  id: Id;
  name: string;
  payload: Omit<PropertyInput, "title" | "address" | "groupIds">;
}
