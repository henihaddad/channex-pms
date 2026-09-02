import type { Id } from "../shared/id.js";
import type { PropertyRecord, RatePlanRecord, RoomTypeRecord, UnitRecord } from "./types.js";
import type { RateCell } from "../inventory/ari.js";

export interface PropertyRepository {
  insertProperty(
    p: PropertyRecord & { address: Record<string, string>; settings: Record<string, unknown> },
  ): Promise<void>;
  addToGroups(propertyId: Id, groupIds: Id[]): Promise<void>;
  insertRoomType(rt: RoomTypeRecord): Promise<void>;
  insertUnit(u: UnitRecord): Promise<void>;
  insertRatePlan(rp: RatePlanRecord): Promise<void>;
  seedRateCells(propertyId: Id, cells: RateCell[]): Promise<void>;
  seedAvailability(
    propertyId: Id,
    roomTypeId: Id,
    from: string,
    days: number,
    available: number,
  ): Promise<void>;
  setWebhookCredentials(propertyId: Id, token: string, secretSealed: string): Promise<void>;
}
