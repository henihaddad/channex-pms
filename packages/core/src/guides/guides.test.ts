import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  GUIDE_SECTIONS,
  GUIDE_VARIABLES,
  emptyGuide,
  guestGuide,
  guideCompleteness,
  guideForGuest,
  guideVariables,
  normaliseSections,
  pickGuide,
  sectionSensitive,
  sectionWritten,
} from "./service.js";
import { interpolate } from "../messaging/templates.js";
import type { GuideSection, PropertyGuide } from "./types.js";

const guide = (sections: GuideSection[], over: Partial<PropertyGuide> = {}): PropertyGuide => ({
  propertyId: "p",
  locale: "en",
  sections,
  published: true,
  updatedAt: "2026-10-01T10:00:00Z",
  ...over,
});
const wifi: GuideSection = {
  kind: "wifi",
  heading: null,
  body: "In the hallway cupboard.",
  fields: { name: "Villa-Guest", password: "sunset2026" },
};
const parking: GuideSection = { kind: "parking", heading: null, body: "Space 4, under the block." };

describe("a guide is eight answerable questions (spec 10 §10.6b)", () => {
  it("opens empty, with every section and nothing written", () => {
    const g = emptyGuide("p", "fr");
    expect(g.sections.map((s) => s.kind)).toEqual(GUIDE_SECTIONS.map((s) => s.kind));
    expect(g.published).toBe(false);
    expect(g.sections.some(sectionWritten)).toBe(false);
    expect(guideCompleteness(g)).toMatchObject({ written: 0, percent: 0 });
  });

  it("counts a section written from a body or from a single field, and names what is left", () => {
    expect(sectionWritten({ kind: "parking", body: "   " })).toBe(false);
    expect(sectionWritten({ kind: "parking", body: "", fields: { x: " " } })).toBe(false);
    expect(sectionWritten({ kind: "wifi", body: "", fields: { name: "Villa" } })).toBe(true);
    const c = guideCompleteness(guide([wifi, parking]));
    expect(c).toMatchObject({ written: 2, total: GUIDE_SECTIONS.length });
    expect(c.unanswered.map((s) => s.kind)).toEqual([
      "arrival",
      "house_rules",
      "amenities",
      "local_tips",
      "departure",
      "emergency",
    ]);
    // the point of the measure: every unanswered question still carries its question text
    expect(c.unanswered.every((s) => s.answers.endsWith("?"))).toBe(true);
  });
});

describe("GUIDE-1 / GUIDE-2: what the guest may see", () => {
  it("shows nothing until published", () => {
    expect(
      guideForGuest(guide([wifi, parking], { published: false }), { accessOpen: true }),
    ).toEqual([]);
    expect(guideForGuest(null, { accessOpen: true })).toEqual([]);
  });

  it("holds the Wi-Fi back until the access window opens, and keeps the rest", () => {
    const closed = guideForGuest(guide([wifi, parking]), { accessOpen: false });
    expect(closed.map((s) => s.kind)).toEqual(["parking"]);
    const open = guideForGuest(guide([wifi, parking]), { accessOpen: true });
    expect(open.map((s) => s.kind)).toEqual(["wifi", "parking"]);
    expect(open[0]?.fields).toEqual({ name: "Villa-Guest", password: "sunset2026" });
  });

  it("lets the manager override the default sensitivity either way", () => {
    expect(sectionSensitive({ kind: "wifi", body: "x" })).toBe(true);
    expect(sectionSensitive({ kind: "wifi", body: "x", sensitive: false })).toBe(false);
    expect(sectionSensitive({ kind: "parking", body: "x", sensitive: true })).toBe(true);
    const early = guideForGuest(guide([{ ...wifi, sensitive: false }]), { accessOpen: false });
    expect(early.map((s) => s.kind)).toEqual(["wifi"]);
  });

  it("renders written sections in spec order whatever order they are stored in", () => {
    const stored = [
      { kind: "departure" as const, body: "Keys in the box." },
      parking,
      { kind: "arrival" as const, body: "Lockbox left of the door." },
    ];
    expect(guideForGuest(guide(stored), { accessOpen: true }).map((s) => s.kind)).toEqual([
      "arrival",
      "parking",
      "departure",
    ]);
  });

  it("never leaks an unwritten section or an empty field", () => {
    const g = guide([{ kind: "wifi", body: "  ", fields: { name: "Villa", password: "  " } }]);
    const [only] = guideForGuest(g, { accessOpen: true });
    expect(only?.body).toBe("");
    expect(only?.fields).toEqual({ name: "Villa" });
  });
});

describe("the guide as template variables (spec 09 §9.3)", () => {
  it("exposes a body as guide.<kind> and a field as guide.<kind>_<field>", () => {
    expect(guideVariables(guide([wifi, parking]))).toEqual({
      wifi: "In the hallway cupboard.",
      wifi_name: "Villa-Guest",
      wifi_password: "sunset2026",
      parking: "Space 4, under the block.",
    });
    expect(guideVariables(null)).toEqual({});
  });

  it("interpolates into a template, and reports an unwritten section as missing", () => {
    const ctx = {
      guest: { first_name: "Amal" },
      property: { name: "Villa" },
      guide: guideVariables(guide([wifi])),
    };
    const r = interpolate(
      "Hi {{guest.first_name}}, the Wi-Fi is {{guide.wifi_name}} / {{guide.wifi_password}}. Parking: {{guide.parking}}",
      ctx,
    );
    expect(r.text).toContain("Villa-Guest / sunset2026");
    expect(r.missing).toEqual(["guide.parking"]);
  });

  it("lists every variable the editor can offer, each one spelled as the interpolator accepts it", () => {
    expect(GUIDE_VARIABLES).toContain("guide.wifi_password");
    expect(GUIDE_VARIABLES).toContain("guide.local_tips");
    expect(GUIDE_VARIABLES).toContain("guide.emergency_phone");
    for (const v of GUIDE_VARIABLES) expect(v).toMatch(/^guide\.[a-z_]+$/);
  });

  it("every variable a full guide fills is one the editor advertises, and the reverse", () => {
    const full = guide(
      GUIDE_SECTIONS.map((s) => ({
        kind: s.kind,
        body: "written",
        fields: Object.fromEntries(s.fields.map((f) => [f, "v"])),
      })),
    );
    const produced = Object.keys(guideVariables(full))
      .map((k) => `guide.${k}`)
      .sort();
    expect(produced).toEqual([...GUIDE_VARIABLES].sort());
  });
});

describe("locale choice mirrors a template's (spec 09 §9.3)", () => {
  const en = guide([parking], { locale: "en" });
  const fr = guide([parking], { locale: "fr" });
  it("prefers the guest's language, then the fallback, then anything", () => {
    expect(pickGuide([en, fr], "fr-CA")?.locale).toBe("fr");
    expect(pickGuide([en, fr], "de")?.locale).toBe("en");
    expect(pickGuide([fr], "de", "en")?.locale).toBe("fr");
    expect(pickGuide([en, fr], null)?.locale).toBe("en");
    expect(pickGuide([], "fr")).toBeNull();
  });
});

describe("guestGuide: the one way to read a guide for a guest", () => {
  const en = guide([wifi, parking], { locale: "en" });
  it("never lets a draft in the guest's language shadow a published guide in another", () => {
    const ptDraft = guide([{ kind: "parking", body: "Lugar 4." }], {
      locale: "pt",
      published: false,
    });
    const read = guestGuide([en, ptDraft], "pt", { accessOpen: true });
    expect(read.map((s) => s.kind)).toEqual(["wifi", "parking"]);
    expect(read.find((s) => s.kind === "parking")?.body).toBe("Space 4, under the block.");
  });

  it("prefers the guest's language once that one is published too", () => {
    const pt = guide([{ kind: "parking", body: "Lugar 4." }], { locale: "pt" });
    expect(guestGuide([en, pt], "pt-BR", { accessOpen: true })[0]?.body).toBe("Lugar 4.");
  });

  it("returns nothing when no guide is published, and still honours the access window", () => {
    expect(
      guestGuide([guide([parking], { published: false })], "en", { accessOpen: true }),
    ).toEqual([]);
    expect(guestGuide([en], "en", { accessOpen: false }).map((s) => s.kind)).toEqual(["parking"]);
  });
});

describe("normaliseSections", () => {
  it("fills in missing sections, trims, drops empty fields and keeps unknown kinds", () => {
    const out = normaliseSections([
      { kind: "parking", body: "  Space 4  ", heading: "  " },
      { kind: "wifi", body: "", fields: { name: " Villa ", password: "  " } },
      { kind: "pets" as never, body: "No pets." },
    ]);
    expect(out.slice(0, GUIDE_SECTIONS.length).map((s) => s.kind)).toEqual(
      GUIDE_SECTIONS.map((s) => s.kind),
    );
    expect(out.find((s) => s.kind === "parking")).toMatchObject({ body: "Space 4", heading: null });
    expect(out.find((s) => s.kind === "wifi")?.fields).toEqual({ name: "Villa" });
    expect(out.at(-1)).toMatchObject({ kind: "pets" });
  });

  it("is idempotent, and never loses what a guest could already read", () => {
    const text = fc.string({ maxLength: 20 });
    const anySections = fc.array(
      fc.record({
        kind: fc.constantFrom(...GUIDE_SECTIONS.map((s) => s.kind)),
        body: text,
        heading: fc.option(text, { nil: null }),
        fields: fc.dictionary(fc.constantFrom("name", "password", "phone"), text, {
          maxKeys: 3,
        }),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(anySections, (sections) => {
        const once = normaliseSections(sections);
        expect(normaliseSections(once)).toEqual(once);
        // normalising only trims: anything the guest could read before, they can read after
        const before = guideVariables({ sections: normaliseSections(sections) });
        expect(guideVariables({ sections: once })).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  it("a normalised guide always reports a completeness between 0 and 100", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom(...GUIDE_SECTIONS.map((s) => s.kind)),
            body: fc.string({ maxLength: 5 }),
          }),
          { maxLength: 10 },
        ),
        (sections) => {
          const c = guideCompleteness({ sections: normaliseSections(sections) });
          expect(c.percent).toBeGreaterThanOrEqual(0);
          expect(c.percent).toBeLessThanOrEqual(100);
          expect(c.written + c.unanswered.length).toBe(c.total);
        },
      ),
      { numRuns: 200 },
    );
  });
});
