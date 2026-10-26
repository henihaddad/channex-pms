import type { GuideSection, GuideSectionKind, GuideSectionSpec, PropertyGuide } from "./types.js";

/**
 * The guide's sections, in the order a guest needs them, each naming the question it
 * answers. This list is the product: it is what turns "write a guide" into eight
 * answerable prompts, and what `guideCompleteness` measures against.
 */
export const GUIDE_SECTIONS: readonly GuideSectionSpec[] = [
  {
    kind: "wifi",
    fields: ["name", "password"],
    sensitive: true,
    answers: "What is the Wi-Fi?",
  },
  { kind: "arrival", fields: [], sensitive: false, answers: "How do I get in?" },
  { kind: "parking", fields: [], sensitive: false, answers: "Where do I park?" },
  { kind: "house_rules", fields: [], sensitive: false, answers: "What are the rules?" },
  { kind: "amenities", fields: [], sensitive: false, answers: "How does the place work?" },
  { kind: "local_tips", fields: [], sensitive: false, answers: "What is worth going to?" },
  { kind: "departure", fields: [], sensitive: false, answers: "How do I check out?" },
  { kind: "emergency", fields: ["phone"], sensitive: false, answers: "Who do I call?" },
];

const SPEC = new Map<GuideSectionKind, GuideSectionSpec>(GUIDE_SECTIONS.map((s) => [s.kind, s]));

/** The spec for a kind, or `null` for a kind this version does not know (forward-compatible reads). */
export function guideSectionSpec(kind: string): GuideSectionSpec | null {
  return SPEC.get(kind as GuideSectionKind) ?? null;
}

const clean = (v: string | null | undefined): string => (v ?? "").trim();

/** A guide with every section empty: what the editor opens on for a property with no guide yet. */
export function emptyGuide(propertyId: string, locale: string): PropertyGuide {
  return {
    propertyId,
    locale,
    sections: GUIDE_SECTIONS.map((s) => ({ kind: s.kind, heading: null, body: "", fields: {} })),
    published: false,
    updatedAt: null,
  };
}

/** Written means a guest would get something from it: a body, or at least one filled field. */
export function sectionWritten(section: GuideSection): boolean {
  return (
    clean(section.body) !== "" || Object.values(section.fields ?? {}).some((v) => clean(v) !== "")
  );
}

/** GUIDE-2: hidden until the access window opens. The section's own flag wins over the default. */
export function sectionSensitive(section: GuideSection): boolean {
  return section.sensitive ?? guideSectionSpec(section.kind)?.sensitive ?? false;
}

export interface GuideCompleteness {
  written: number;
  total: number;
  percent: number;
  /** The questions still left to the inbox, in section order. */
  unanswered: readonly GuideSectionSpec[];
}

/**
 * How much of the guide is written, and which guest questions it still does not answer.
 * The unanswered list is the point: a 60 % guide is not a score, it is three questions
 * the manager will be asked by hand.
 */
export function guideCompleteness(guide: Pick<PropertyGuide, "sections">): GuideCompleteness {
  const written = new Set(guide.sections.filter(sectionWritten).map((s) => s.kind));
  const unanswered = GUIDE_SECTIONS.filter((s) => !written.has(s.kind));
  const total = GUIDE_SECTIONS.length;
  const count = total - unanswered.length;
  return { written: count, total, percent: Math.round((count / total) * 100), unanswered };
}

/**
 * The guide as template variables (spec 09 §9.3): `guide.<kind>` for a section's body and
 * `guide.<kind>_<field>` for its fields, so `{{guide.wifi_password}}` and `{{guide.parking}}`
 * work in any template. Empty values are left out so `interpolate` reports them as missing
 * rather than sending a guest a blank line.
 */
export function guideVariables(
  guide: Pick<PropertyGuide, "sections"> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of guide?.sections ?? []) {
    const body = clean(section.body);
    if (body) out[section.kind] = body;
    for (const [field, value] of Object.entries(section.fields ?? {})) {
      const v = clean(value);
      if (v) out[`${section.kind}_${field}`] = v;
    }
  }
  return out;
}

/** Every variable a guide can expose, for the template editor's help panel. */
export const GUIDE_VARIABLES: readonly string[] = GUIDE_SECTIONS.flatMap((s) => [
  `guide.${s.kind}`,
  ...s.fields.map((f) => `guide.${s.kind}_${f}`),
]);

export interface GuestGuideSection {
  kind: GuideSectionKind;
  /** The manager's own heading, or `null` to use the translated default. */
  heading: string | null;
  body: string;
  fields: Readonly<Record<string, string>>;
}

/**
 * What the guest portal renders: written sections in spec order, with sensitive ones
 * (the Wi-Fi password) held back until the access window opens, the same window that
 * reveals the door code. An unpublished guide shows nothing at all (GUIDE-1).
 */
export function guideForGuest(
  guide: PropertyGuide | null | undefined,
  opts: { accessOpen: boolean },
): readonly GuestGuideSection[] {
  if (!guide?.published) return [];
  const bySpec = new Map(guide.sections.map((s) => [s.kind, s]));
  const out: GuestGuideSection[] = [];
  for (const spec of GUIDE_SECTIONS) {
    const section = bySpec.get(spec.kind);
    if (!section || !sectionWritten(section)) continue;
    if (sectionSensitive(section) && !opts.accessOpen) continue;
    const fields: Record<string, string> = {};
    for (const field of spec.fields) {
      const v = clean(section.fields?.[field]);
      if (v) fields[field] = v;
    }
    out.push({
      kind: spec.kind,
      heading: clean(section.heading) || null,
      body: clean(section.body),
      fields,
    });
  }
  return out;
}

/**
 * The guide a guest should read: their own language, then the org's fallback, then
 * whatever exists. Same rule as a template's locale variant (spec 09 §9.3), so a guest
 * never gets a half-translated stay.
 */
export function pickGuide(
  guides: readonly PropertyGuide[],
  guestLanguage: string | null | undefined,
  fallbackLocale = "en",
): PropertyGuide | null {
  const lang = clean(guestLanguage).slice(0, 2).toLowerCase();
  return (
    (lang ? guides.find((g) => g.locale === lang) : undefined) ??
    guides.find((g) => g.locale === fallbackLocale) ??
    guides[0] ??
    null
  );
}

/**
 * The guide a guest reads: the published ones only, their language first, and then the
 * sections they may see. The filter comes before the locale choice on purpose — a draft
 * in the guest's language must never shadow a published guide in another, which would
 * leave them with no guide at all.
 */
export function guestGuide(
  guides: readonly PropertyGuide[],
  guestLanguage: string | null | undefined,
  opts: { accessOpen: boolean; fallbackLocale?: string },
): readonly GuestGuideSection[] {
  const published = guides.filter((g) => g.published);
  return guideForGuest(pickGuide(published, guestLanguage, opts.fallbackLocale), opts);
}

/**
 * The guide's variables for a message to a guest: the same published-then-language rule
 * as `guestGuide`, so the portal and the pre-arrival message never disagree about which
 * guide a guest is reading. No access window here — a template's own variables decide
 * what it says, and the automation guard decides when it may say it (AUTO-*).
 */
export function guestGuideVariables(
  guides: readonly PropertyGuide[],
  guestLanguage: string | null | undefined,
  fallbackLocale?: string,
): Record<string, string> {
  return guideVariables(
    pickGuide(
      guides.filter((g) => g.published),
      guestLanguage,
      fallbackLocale,
    ),
  );
}

/**
 * Sections as stored: every known kind, in spec order, so the editor always shows the
 * full set of prompts and a guide written before a section existed gains it empty.
 * Unknown kinds from a newer version are kept untouched rather than dropped.
 */
export function normaliseSections(
  sections: readonly GuideSection[] | null | undefined,
): readonly GuideSection[] {
  const given = new Map<string, GuideSection>((sections ?? []).map((s) => [s.kind, s]));
  const known = GUIDE_SECTIONS.map((spec) => {
    const s = given.get(spec.kind);
    given.delete(spec.kind);
    return {
      kind: spec.kind,
      heading: clean(s?.heading) || null,
      body: clean(s?.body),
      fields: Object.fromEntries(
        spec.fields.map((f) => [f, clean(s?.fields?.[f])] as const).filter(([, v]) => v !== ""),
      ),
      ...(s?.sensitive === undefined ? {} : { sensitive: s.sensitive }),
    } satisfies GuideSection;
  });
  return [...known, ...given.values()];
}
