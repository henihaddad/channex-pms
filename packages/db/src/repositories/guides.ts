import { and, asc, eq } from "drizzle-orm";
import { normaliseSections, type GuideSection, type PropertyGuide } from "@pms/core";
import * as s from "../schema/index.js";
import type { Tx } from "../tenant.js";

const row = (r: {
  propertyId: string;
  locale: string;
  sections: Array<Record<string, unknown>>;
  published: boolean;
  updatedAt: string;
}): PropertyGuide => ({
  propertyId: r.propertyId,
  locale: r.locale,
  sections: normaliseSections(r.sections as unknown as GuideSection[]),
  published: r.published,
  updatedAt: r.updatedAt,
});

/** The guest guide, per property and per locale (spec 10 §10.6b). */
export class DrizzleGuideRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  /** Every locale written for a property, so the editor can offer the ones that exist. */
  async forProperty(propertyId: string): Promise<PropertyGuide[]> {
    const rows = await this.tx
      .select()
      .from(s.propertyGuide)
      .where(eq(s.propertyGuide.propertyId, propertyId))
      .orderBy(asc(s.propertyGuide.locale));
    return rows.map(row);
  }

  async get(propertyId: string, locale: string): Promise<PropertyGuide | null> {
    const [r] = await this.tx
      .select()
      .from(s.propertyGuide)
      .where(and(eq(s.propertyGuide.propertyId, propertyId), eq(s.propertyGuide.locale, locale)))
      .limit(1);
    return r ? row(r) : null;
  }

  /**
   * Writes the guide whole. Sections are normalised on the way in, so a section added
   * to the product appears empty rather than missing, and `published` is kept unless
   * the caller means to change it (GUIDE-1 is a deliberate action, never a side effect).
   */
  async save(
    propertyId: string,
    locale: string,
    next: { sections: readonly GuideSection[]; published?: boolean },
    updatedBy: string | null,
  ): Promise<void> {
    const sections = normaliseSections(next.sections) as unknown as Array<Record<string, unknown>>;
    const values = {
      propertyId,
      locale,
      orgId: this.orgId,
      sections,
      published: next.published ?? false,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
    await this.tx
      .insert(s.propertyGuide)
      .values(values)
      .onConflictDoUpdate({
        target: [s.propertyGuide.propertyId, s.propertyGuide.locale],
        set: {
          sections,
          ...(next.published === undefined ? {} : { published: next.published }),
          updatedBy,
          updatedAt: values.updatedAt,
        },
      });
  }

  /** GUIDE-1: publishing and unpublishing are their own action, audited like any content change. */
  async setPublished(propertyId: string, locale: string, published: boolean): Promise<void> {
    await this.tx
      .update(s.propertyGuide)
      .set({ published, updatedAt: new Date().toISOString() })
      .where(and(eq(s.propertyGuide.propertyId, propertyId), eq(s.propertyGuide.locale, locale)));
  }
}
