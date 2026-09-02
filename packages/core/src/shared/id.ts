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
