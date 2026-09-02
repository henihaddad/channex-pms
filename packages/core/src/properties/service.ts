import type { Clock } from "../shared/clock.js";
import { Id } from "../shared/id.js";
import { DomainError, err, ok, type Result } from "../shared/result.js";
import { DEFAULT_HORIZON_DAYS, seedHorizon } from "../inventory/horizon.js";
import type { PropertyRepository } from "./ports.js";
import type {
  PropertyInput,
  PropertyRecord,
  PropertyTemplate,
  RatePlanRecord,
  RoomTypeRecord,
  UnitRecord,
} from "./types.js";

export interface CreatePropertyDeps {
  repo: PropertyRepository;
  clock: Clock;
  orgId: Id;
  horizonDays?: number;
  /** Random token + sealing for the webhook receiver credentials (spec 05 §5.5.1). */
  webhookCredentials: () => Promise<{ token: string; secretSealed: string }>;
}

export interface CreatedProperty {
  property: PropertyRecord;
  roomTypes: RoomTypeRecord[];
  units: UnitRecord[];
  ratePlans: RatePlanRecord[];
  seededCells: number;
}

/**
 * Create a property with its inventory (spec 03 §3.2, MODEL-1, INV-11):
 * a single_unit property gets exactly one system-managed room type and unit,
 * invisible in the UI; multi_unit and hotel get what the wizard specified.
 * Rate plans are seeded for the horizon so the calendar is never empty.
 */
export async function createProperty(
  deps: CreatePropertyDeps,
  input: PropertyInput,
): Promise<Result<CreatedProperty>> {
  if (!/^[A-Z]{3}$/.test(input.currency))
    return err(new DomainError("property.currency", "Currency must be an ISO 4217 code"));
  if (input.kind !== "single_unit" && (!input.roomTypes || input.roomTypes.length === 0)) {
    return err(
      new DomainError(
        "property.room_types",
        "multi_unit and hotel properties need at least one room type",
      ),
    );
  }
  const property: PropertyRecord = {
    id: Id.next(),
    orgId: deps.orgId,
    kind: input.kind,
    title: input.title,
    currency: input.currency,
    timezone: input.timezone,
    state: "draft",
  };
  await deps.repo.insertProperty({
    ...property,
    address: input.address ?? {},
    settings: input.settings ?? {},
  });
  if (input.groupIds?.length) await deps.repo.addToGroups(property.id, input.groupIds);

  const roomTypes: RoomTypeRecord[] = [];
  const units: UnitRecord[] = [];
  const specs =
    input.kind === "single_unit"
      ? [
          {
            title: input.title,
            countOfRooms: 1,
            occAdults: 2,
            occChildren: 0,
            unitNames: [input.title],
            system: true,
          },
        ]
      : input.roomTypes!.map((r) => ({ ...r, system: false }));
  for (const spec of specs) {
    const rt: RoomTypeRecord = {
      id: Id.next(),
      propertyId: property.id,
      title: spec.title,
      countOfRooms: spec.countOfRooms,
      occAdults: spec.occAdults,
      occChildren: spec.occChildren,
      occInfants: 0,
      maxOccupancy: spec.occAdults + spec.occChildren,
      defaultOccupancy: spec.occAdults,
      isSystemManaged: spec.system,
    };
    await deps.repo.insertRoomType(rt);
    roomTypes.push(rt);
    const names = spec.unitNames?.length
      ? spec.unitNames
      : Array.from({ length: spec.countOfRooms }, (_, i) => `${spec.title} ${String(i + 1)}`);
    if (names.length !== spec.countOfRooms)
      return err(
        new DomainError(
          "property.units",
          `${spec.title}: ${String(names.length)} unit names for ${String(spec.countOfRooms)} rooms`,
        ),
      );
    for (const name of names) {
      const u: UnitRecord = {
        id: Id.next(),
        propertyId: property.id,
        roomTypeId: rt.id,
        name,
        isSystemManaged: spec.system,
      };
      await deps.repo.insertUnit(u);
      units.push(u);
    }
  }

  const ratePlans: RatePlanRecord[] = [];
  let seededCells = 0;
  const horizon = deps.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = deps.clock.today(input.timezone);
  const planSpecs = input.ratePlans?.length
    ? input.ratePlans
    : [{ title: "Standard", baseRateMinor: 10000, minStay: 1 }];
  for (const spec of planSpecs) {
    const rt = spec.roomTypeTitle
      ? roomTypes.find((r) => r.title === spec.roomTypeTitle)
      : roomTypes[0];
    if (!rt)
      return err(
        new DomainError(
          "property.rate_plan_room_type",
          `Rate plan ${spec.title}: unknown room type ${spec.roomTypeTitle ?? ""}`,
        ),
      );
    const rp: RatePlanRecord = {
      id: Id.next(),
      propertyId: property.id,
      roomTypeId: rt.id,
      title: spec.title,
      currency: input.currency,
      parentRatePlanId: null,
    };
    await deps.repo.insertRatePlan(rp);
    ratePlans.push(rp);
    const cells = seedHorizon(rp.id, today, horizon, {
      rate: spec.baseRateMinor,
      minStay: spec.minStay ?? 1,
      stopSell: false,
      closedToArrival: false,
      closedToDeparture: false,
    });
    await deps.repo.seedRateCells(property.id, cells);
    seededCells += cells.length;
  }
  for (const rt of roomTypes)
    await deps.repo.seedAvailability(
      property.id,
      rt.id,
      today.toString(),
      horizon,
      rt.countOfRooms,
    );
  const creds = await deps.webhookCredentials();
  await deps.repo.setWebhookCredentials(property.id, creds.token, creds.secretSealed);
  return ok({ property, roomTypes, units, ratePlans, seededCells });
}

/** Templates make listing #40 take three minutes (spec 03 §3.2): apply a saved bundle, override the specifics. */
export function fromTemplate(
  template: PropertyTemplate,
  overrides: Pick<PropertyInput, "title" | "address" | "groupIds"> & Partial<PropertyInput>,
): PropertyInput {
  return { ...template.payload, ...overrides };
}

/** Clone: the source property's shape as a template with a new title. */
export function cloneInput(source: PropertyInput, title: string): PropertyInput {
  return { ...source, title };
}

/** Bulk CSV import row → input; unknown columns are ignored, required ones validated. */
export function fromCsvRow(
  row: Record<string, string>,
  defaults: { currency: string; timezone: string },
): Result<PropertyInput> {
  const title = row.title?.trim();
  if (!title) return err(new DomainError("import.title", "title is required"));
  const kind = (row.kind?.trim() || "single_unit") as PropertyInput["kind"];
  if (!["single_unit", "multi_unit", "hotel"].includes(kind))
    return err(new DomainError("import.kind", `unknown kind ${kind}`));
  const rate = row.base_rate ? Math.round(Number(row.base_rate) * 100) : 10000;
  if (!Number.isFinite(rate) || rate < 0)
    return err(new DomainError("import.base_rate", `invalid base_rate ${row.base_rate ?? ""}`));
  return ok({
    title,
    kind,
    currency: (row.currency?.trim() || defaults.currency).toUpperCase(),
    timezone: row.timezone?.trim() || defaults.timezone,
    address: { city: row.city ?? "", country: row.country ?? "" },
    ratePlans: [
      { title: "Standard", baseRateMinor: rate, minStay: Number(row.min_stay ?? 1) || 1 },
    ],
  });
}
