import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

/**
 * Per-property rate import (spec 06 §6.5b): which engine prices this property, the guard
 * rails its recommendations must pass, and whether a scheduled pull applies them or only
 * records them for review (YR-4's shadow mode, which is the default).
 */
export const rateImportSettings = pgTable("rate_import_settings", {
  propertyId: uuid("property_id")
    .primaryKey()
    .references(() => property.id),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  /** The adapter's name; `csv` is the manual upload and needs no credentials. */
  provider: text("provider").notNull().default("csv"),
  /** The engine's own identifier for this property, for a scheduled pull. */
  providerRef: text("provider_ref"),
  /** A scheduled pull runs only when this is on. */
  enabled: boolean("enabled").notNull().default(false),
  /** YR-4: off by default, so a pull proposes and a human applies. */
  autoApply: boolean("auto_apply").notNull().default(false),
  floorMinor: integer("floor_minor"),
  ceilingMinor: integer("ceiling_minor"),
  maxChangeBps: integer("max_change_bps"),
  /** YR-5: hours a cell a human edited is left alone. */
  holdHours: integer("hold_hours").notNull().default(48),
  /** The engine's listing reference → one of this property's rate plan ids. */
  mapping: jsonb("mapping").notNull().default({}).$type<Record<string, string>>(),
  lastRunAt: ts("last_run_at"),
  lastError: text("last_error"),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`now()`),
});
