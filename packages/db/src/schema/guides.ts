import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, property } from "./identity.js";
import { user } from "./identity.js";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

/**
 * The guest guide, per property and per locale (spec 10 §10.6b). Sections are stored as
 * written JSON rather than a row per section: the set of sections is the product's, not
 * the tenant's, and a guide is always read and written whole.
 */
export const propertyGuide = pgTable(
  "property_guide",
  {
    propertyId: uuid("property_id")
      .notNull()
      .references(() => property.id),
    locale: text("locale").notNull().default("en"),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    sections: jsonb("sections").notNull().default([]).$type<Array<Record<string, unknown>>>(),
    /** GUIDE-1: a guide reaches guests only once the manager publishes it. */
    published: boolean("published").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => user.id),
    updatedAt: ts("updated_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.locale] })],
);
