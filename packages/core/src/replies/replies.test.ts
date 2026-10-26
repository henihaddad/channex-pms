import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { detectIntents, normaliseQuestion } from "./intents.js";
import { suggestReply, unansweredIntents } from "./service.js";
import { FakeLlmProvider, NoLlmProvider } from "./fake.js";
import { GUIDE_SECTIONS } from "../guides/service.js";
import type { GuideSection, PropertyGuide } from "../guides/types.js";
import type { ReplyPhrases } from "./types.js";

const phrases: ReplyPhrases = {
  greeting: "Hi Ana,",
  closing: "Let me know if you need anything else.",
  fieldLabels: { wifi_name: "Network", wifi_password: "Password", emergency_phone: "Phone" },
};
const wifi: GuideSection = {
  kind: "wifi",
  heading: null,
  body: "The router is in the hallway cupboard.",
  fields: { name: "Villa-Guest", password: "sunset2026" },
};
const parking: GuideSection = {
  kind: "parking",
  heading: null,
  body: "Space 4, under the block.",
};
const guide = (sections: GuideSection[], over: Partial<PropertyGuide> = {}): PropertyGuide => ({
  propertyId: "p",
  locale: "en",
  sections,
  published: true,
  updatedAt: null,
  ...over,
});
const ask = (question: string, guides: PropertyGuide[], accessOpen = true) =>
  suggestReply({ question, guides, accessOpen, phrases, guestLanguage: null });

describe("what was asked (spec 09 §9.3)", () => {
  it("folds accents, Arabic diacritics and punctuation before matching", () => {
    expect(normaliseQuestion("Wi-Fi?!")).toBe("wi fi");
    expect(normaliseQuestion("Où se garer ?")).toBe("ou se garer");
    expect(normaliseQuestion("كَلِمَةُ المرور")).toBe("كلمه المرور");
  });

  it("recognises the question in each launch locale", () => {
    expect(detectIntents("What is the wifi password?")[0]).toBe("wifi");
    expect(detectIntents("Quel est le mot de passe du réseau ?")[0]).toBe("wifi");
    expect(detectIntents("ما هي كلمة المرور للواي فاي؟")[0]).toBe("wifi");
    expect(detectIntents("¿Dónde puedo aparcar el coche?")[0]).toBe("parking");
    expect(detectIntents("A que horas é a saída?")[0]).toBe("departure");
    expect(detectIntents("Where can I park?")[0]).toBe("parking");
    expect(detectIntents("The heating is not working")).toContain("emergency");
    expect(detectIntents("Can you recommend a restaurant nearby?")[0]).toBe("local_tips");
  });

  it("ranks the better-matched section first and returns nothing for small talk", () => {
    const both = detectIntents("What time is check out, and where are the bins?");
    expect(both[0]).toBe("departure");
    expect(detectIntents("Thanks, see you soon!")).toEqual([]);
    expect(detectIntents("   ")).toEqual([]);
  });

  it("only ever names a section the guide knows about", () => {
    const kinds = new Set<string>(GUIDE_SECTIONS.map((s) => s.kind));
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (q) => {
        for (const k of detectIntents(q)) expect(kinds.has(k)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("a draft is the guide, pointed at the question", () => {
  it("answers from the matching section and nothing else", async () => {
    const d = await ask("Where do I park the car?", [guide([wifi, parking])]);
    expect(d.origin).toBe("guide");
    expect(d.intents[0]).toBe("parking");
    expect(d.sources).toEqual(["parking"]);
    expect(d.body).toBe(
      "Hi Ana,\n\nSpace 4, under the block.\n\nLet me know if you need anything else.",
    );
    expect(d.body).not.toContain("sunset2026");
    expect(d.warnings).toEqual([]);
    expect(d.requiresHuman).toBe(true);
  });

  it("labels the structured fields and keeps the manager's prose", async () => {
    const d = await ask("What's the wifi?", [guide([wifi])]);
    expect(d.body).toContain("Network: Villa-Guest");
    expect(d.body).toContain("Password: sunset2026");
    expect(d.body).toContain("The router is in the hallway cupboard.");
  });

  it("answers both halves of a two-part question, best match first", async () => {
    const bins = { kind: "departure" as const, body: "Bins are in the courtyard." };
    const d = await ask("What time is check out and where do I park?", [guide([parking, bins])]);
    expect(d.sources).toEqual(["departure", "parking"]);
    expect(d.body.indexOf("Bins")).toBeLessThan(d.body.indexOf("Space 4"));
  });

  it("warns before quoting the Wi-Fi outside the access window (GUIDE-2)", async () => {
    const closed = await ask("wifi password please", [guide([wifi])], false);
    expect(closed.warnings).toEqual(["sensitive_before_window"]);
    // it still drafts it: a human is sending this on purpose, they just get told
    expect(closed.body).toContain("sunset2026");
    const open = await ask("wifi password please", [guide([wifi])], true);
    expect(open.warnings).toEqual([]);
  });

  it("says when the guide does not answer a question it recognised", async () => {
    const d = await ask("Can you recommend a restaurant?", [guide([wifi])]);
    expect(d.intents).toEqual(["local_tips"]);
    expect(d.sources).toEqual([]);
    expect(d.warnings).toEqual(["unanswered_question"]);
    expect(d.body).toBe("Hi Ana,\n\nLet me know if you need anything else.");
    expect(unansweredIntents("Can you recommend a restaurant?", guide([wifi]))).toEqual([
      "local_tips",
    ]);
  });

  it("says when it could not tell what was asked", async () => {
    const d = await ask("Hello there", [guide([wifi, parking])]);
    expect(d.warnings).toEqual(["unrecognised_question"]);
    expect(d.sources).toEqual([]);
  });

  it("GUIDE-1: a draft guide answers nothing", async () => {
    const d = await ask("Where do I park?", [guide([parking], { published: false })]);
    expect(d.sources).toEqual([]);
    expect(d.warnings).toEqual(["unanswered_question"]);
  });

  it("reads the guest's language when that guide is published, else the fallback", async () => {
    const en = guide([parking], { locale: "en" });
    const fr = guide([{ kind: "parking", body: "Place 4, au sous-sol." }], { locale: "fr" });
    const drafted = await suggestReply({
      question: "Où se garer ?",
      guides: [en, fr],
      guestLanguage: "fr-CA",
      accessOpen: true,
      phrases,
    });
    expect(drafted.body).toContain("Place 4, au sous-sol.");
    const noFr = await suggestReply({
      question: "Où se garer ?",
      guides: [en, { ...fr, published: false }],
      guestLanguage: "fr",
      accessOpen: true,
      phrases,
    });
    expect(noFr.body).toContain("Space 4, under the block.");
  });

  it("never quotes a section the guide has not written", async () => {
    const anyGuide = fc.array(
      fc.record({
        kind: fc.constantFrom(...GUIDE_SECTIONS.map((s) => s.kind)),
        body: fc.constantFrom("", "   ", "written answer"),
      }),
      { maxLength: 8 },
    );
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 50 }), anyGuide, async (question, sections) => {
        const d = await ask(question, [guide(sections)]);
        const writtenKinds = new Set(
          sections.filter((s) => s.body.trim() !== "").map((s) => s.kind),
        );
        for (const k of d.sources) expect(writtenKinds.has(k)).toBe(true);
        // and every source is something the question actually pointed at
        for (const k of d.sources) expect(d.intents).toContain(k);
      }),
      { numRuns: 200 },
    );
  });
});

describe("the LlmProvider port (spec 09 §9.3, Q12)", () => {
  it("falls back to the guide when no provider is wired, or the provider declines", async () => {
    const none = await suggestReply(
      { question: "wifi?", guides: [guide([wifi])], accessOpen: true, phrases },
      new NoLlmProvider(),
    );
    expect(none.origin).toBe("guide");
    const empty = await suggestReply(
      { question: "wifi?", guides: [guide([])], accessOpen: true, phrases },
      new FakeLlmProvider(),
    );
    expect(empty.origin).toBe("guide");
  });

  it("uses the model's words when it answers, keeping the label and the warnings", async () => {
    const llm = new FakeLlmProvider();
    const d = await suggestReply(
      {
        question: "What is the wifi password?",
        guides: [guide([wifi])],
        accessOpen: false,
        phrases,
        stay: {
          arrival: "2026-10-04",
          departure: "2026-10-07",
          nights: 3,
          propertyName: "Villa",
        },
      },
      llm,
    );
    expect(d.origin).toBe("llm");
    expect(d.body).toContain("here is what you need");
    expect(d.sources).toEqual(["wifi"]);
    expect(d.warnings).toEqual(["sensitive_before_window"]);
    expect(d.requiresHuman).toBe(true);
  });

  it("hands the model the question, the guide and dateless stay facts — and no guest PII", async () => {
    const llm = new FakeLlmProvider();
    await suggestReply(
      {
        question: "What is the wifi password?",
        guides: [guide([wifi])],
        guestLanguage: "fr",
        accessOpen: true,
        phrases,
        stay: {
          arrival: "2026-10-04",
          departure: "2026-10-07",
          nights: 3,
          propertyName: "Villa",
        },
      },
      llm,
    );
    const sent = llm.calls[0]!;
    expect(Object.keys(sent).sort()).toEqual(["guide", "locale", "question", "stay"]);
    expect(sent.question).toBe("What is the wifi password?");
    expect(sent.guide.map((g) => g.kind)).toEqual(["wifi"]);
    // the greeting carries the guest's name, so it must not be in what the model sees
    expect(JSON.stringify(sent)).not.toContain("Ana");
  });
});
