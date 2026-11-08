import { v7 as uuidv7, validate } from "uuid";

/** UUIDv7: time-sortable, safe to expose, no cross-tenant sequence contention (spec 03 §3.1 rule 6). */
export type Id = string & { readonly __brand: "Id" };

export const Id = {
  next(): Id {
    return uuidv7() as Id;
  },
  parse(value: string): Id {
    if (!validate(value)) throw new TypeError(`Not a UUID: ${value}`);
    return value as Id;
  },
  is(value: unknown): value is Id {
    return typeof value === "string" && validate(value);
  },
};

/**
 * The short code a guest reads for a booking we took ourselves (staff, phone, booking site).
 * A UUIDv7 starts with its timestamp, so its first characters repeat for bookings made
 * within the same minute; the last eight hex digits are random.
 */
export function bookingReference(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}
