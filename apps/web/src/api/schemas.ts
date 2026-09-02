import { z } from "zod";

/** Request schemas shared by handlers and the OpenAPI document. Handlers stay thin; this file is not a handler module. */
export const ADAPTERS = [
  "BookingCom",
  "AirBNB",
  "Expedia",
  "Agoda",
  "Vrbo",
  "GoogleHotelAds",
] as const;

const roomTypeSchema = z.object({
  title: z.string().min(1),
  countOfRooms: z.coerce.number().int().min(1),
  occAdults: z.coerce.number().int().min(1),
  occChildren: z.coerce.number().int().min(0).default(0),
});
const ratePlanSchema = z.object({
  title: z.string().min(1),
  roomTypeTitle: z.string().optional(),
  baseRateMinor: z.coerce.number().int().min(0),
  minStay: z.coerce.number().int().min(1).default(1),
});
export const propertyInputSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["single_unit", "multi_unit", "hotel"]),
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  timezone: z.string().min(1),
  address: z.record(z.string(), z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
  roomTypes: z.array(roomTypeSchema).optional(),
  ratePlans: z.array(ratePlanSchema).optional(),
  templateId: z.string().optional(),
});

export const gridQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  propertyIds: z.array(z.string()).optional(),
  groupId: z.string().optional(),
});

export const rateEditSchema = z.object({
  propertyId: z.string(),
  edits: z
    .array(
      z.object({
        ratePlanId: z.string(),
        date: z.string(),
        expectedVersion: z.number().int().optional(),
        values: z.object({ rate: z.number().int().min(0) }),
      }),
    )
    .min(1)
    .max(2000),
});

const restrictionValues = z.object({
  minStay: z.number().int().min(1).nullable().optional(),
  minStayArrival: z.number().int().min(1).nullable().optional(),
  minStayThrough: z.number().int().min(1).nullable().optional(),
  maxStay: z.number().int().min(1).nullable().optional(),
  closedToArrival: z.boolean().optional(),
  closedToDeparture: z.boolean().optional(),
  stopSell: z.boolean().optional(),
});
export const restrictionEditSchema = z.object({
  propertyId: z.string(),
  edits: z
    .array(
      z.object({
        ratePlanId: z.string(),
        date: z.string(),
        expectedVersion: z.number().int().optional(),
        values: restrictionValues,
      }),
    )
    .min(1)
    .max(2000),
});

const bulkOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_rate"), rateMinor: z.number().int() }),
  z.object({
    op: z.literal("adjust_rate_percent"),
    basisPoints: z.number().int(),
    rounding: z.enum(["nearest", "up", "down"]).optional(),
    roundToMinor: z.number().int().optional(),
  }),
  z.object({ op: z.literal("adjust_rate_amount"), deltaMinor: z.number().int() }),
  z.object({ op: z.literal("set_min_stay"), minStay: z.number().int().nullable() }),
  z.object({ op: z.literal("set_max_stay"), maxStay: z.number().int().nullable() }),
  z.object({ op: z.literal("set_cta"), closed: z.boolean() }),
  z.object({ op: z.literal("set_ctd"), closed: z.boolean() }),
  z.object({ op: z.literal("stop_sell"), stop: z.boolean() }),
]);
export const bulkSchema = z.object({
  propertyId: z.string(),
  dateFrom: z.string(),
  dateTo: z.string(),
  days: z.array(z.enum(["mo", "tu", "we", "th", "fr", "sa", "su"])).optional(),
  ratePlanIds: z.array(z.string()).min(1),
  ops: z.array(bulkOp).min(1),
  horizonEnd: z.string(),
  override: z.boolean().optional(),
  dryRun: z.boolean().default(true),
});
