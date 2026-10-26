/**
 * The guest guide (spec 10 §10.6b): the answers to the questions guests ask over and
 * over — the Wi-Fi, how to get in, where to park, what the rules are, what is worth
 * walking to. Written once per property, shown in the guest portal, and readable from
 * a message template as `{{guide.*}}` so the pre-arrival message answers them before
 * they are asked.
 *
 * Persona: the manager writes it (spec 02 `property_manager`); the guest reads it.
 */

/** The sections of a guide, in the order a guest needs them. Open string is refused: the set is the product. */
export type GuideSectionKind =
  | "wifi"
  | "arrival"
  | "departure"
  | "parking"
  | "house_rules"
  | "amenities"
  | "local_tips"
  | "emergency";

/**
 * One section. `body` is plain text the manager types; `fields` are the structured
 * values a template can interpolate (`wifi.name`, `wifi.password`). A section with an
 * empty body and no fields is "not written yet" and never renders.
 */
export interface GuideSection {
  kind: GuideSectionKind;
  /** Overrides the default heading when the manager wants their own words. */
  heading?: string | null;
  body: string;
  fields?: Readonly<Record<string, string>>;
  /** GUIDE-2: a section the guest should not see before the access window opens. */
  sensitive?: boolean;
}

/** A guide, per property and per locale, so a French guest reads French (spec 09 §9.3 locale variants). */
export interface PropertyGuide {
  propertyId: string;
  locale: string;
  sections: readonly GuideSection[];
  /** GUIDE-1: a guide is shown to guests only once the manager publishes it. */
  published: boolean;
  updatedAt: string | null;
}

/** What a section is for, and the structured fields it carries. Drives the editor and the variable list. */
export interface GuideSectionSpec {
  kind: GuideSectionKind;
  /** Structured fields, in editor order. */
  fields: readonly string[];
  /** Hidden until the access window opens (GUIDE-2). */
  sensitive: boolean;
  /**
   * The guest question this section answers. A guide that leaves it blank leaves that
   * question to the inbox, which is the whole point of measuring completeness.
   */
  answers: string;
}
