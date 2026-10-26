import {
  guideSectionSpec,
  pickGuide,
  sectionSensitive,
  sectionWritten,
} from "../guides/service.js";
import type { GuideSection, GuideSectionKind, PropertyGuide } from "../guides/types.js";
import { detectIntents } from "./intents.js";
import type {
  LlmDraftInput,
  LlmProvider,
  ReplyDraft,
  ReplyPhrases,
  ReplyWarning,
} from "./types.js";

export interface SuggestReplyInput {
  /** What the guest wrote, verbatim. */
  question: string;
  /** Every guide the property has; only published ones are used (GUIDE-1). */
  guides: readonly PropertyGuide[];
  guestLanguage?: string | null;
  fallbackLocale?: string;
  /** Whether the access window is open, so the draft can warn before quoting the Wi-Fi. */
  accessOpen: boolean;
  phrases: ReplyPhrases;
  stay?: LlmDraftInput["stay"];
}

const field = (key: string, phrases: ReplyPhrases): string =>
  phrases.fieldLabels?.[key] ?? key.replace(/^[a-z_]+?_/, "").replace(/_/g, " ");

/** One section as the guest would read it: its fields as labelled lines, then its prose. */
function sectionText(section: GuideSection, phrases: ReplyPhrases): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(section.fields ?? {})) {
    if (value.trim()) lines.push(`${field(`${section.kind}_${name}`, phrases)}: ${value.trim()}`);
  }
  if (section.body.trim()) lines.push(section.body.trim());
  return lines.join("\n");
}

/**
 * A reply drafted from the property's own guide, and from a model only if one is wired
 * and the guide came up short.
 *
 * Nothing here sends: the result is text for the composer, labelled with what it thinks
 * was asked and what it used (spec 09 §9.3). When the guide does not answer a question we
 * recognised, the warning says so — that is the loop worth having, because writing the
 * section once stops the question coming back.
 */
export async function suggestReply(
  input: SuggestReplyInput,
  llm?: LlmProvider | null,
): Promise<ReplyDraft> {
  const guide = pickGuide(
    input.guides.filter((g) => g.published),
    input.guestLanguage,
    input.fallbackLocale,
  );
  const intents = detectIntents(input.question);
  const written = new Map<GuideSectionKind, GuideSection>(
    (guide?.sections ?? []).filter(sectionWritten).map((s) => [s.kind, s] as const),
  );
  // the sections we can actually answer with, in the order the question suggested
  const used = intents.filter((k) => written.has(k));
  const warnings: ReplyWarning[] = [];
  if (intents.length === 0) warnings.push("unrecognised_question");
  else if (used.length === 0) warnings.push("unanswered_question");
  if (used.some((k) => sectionSensitive(written.get(k)!)) && !input.accessOpen)
    warnings.push("sensitive_before_window");

  const sections = used.map((kind) => ({
    kind,
    text: sectionText(written.get(kind)!, input.phrases),
  }));

  if (llm) {
    const drafted = await llm.draft({
      question: input.question,
      guide: sections,
      ...(input.stay ? { stay: input.stay } : {}),
      locale: guide?.locale ?? input.fallbackLocale ?? "en",
    });
    if (drafted && drafted.trim())
      return {
        origin: "llm",
        intents,
        sources: used,
        body: drafted.trim(),
        warnings,
        requiresHuman: true,
      };
  }

  const body = [
    input.phrases.greeting,
    ...sections.map((s) => s.text).filter(Boolean),
    input.phrases.closing,
  ]
    .filter((part) => part.trim() !== "")
    .join("\n\n");
  return { origin: "guide", intents, sources: used, body, warnings, requiresHuman: true };
}

/** Section kinds a question points at that the guide leaves unwritten — the editor's prompt to fill them. */
export function unansweredIntents(
  question: string,
  guide: PropertyGuide | null | undefined,
): readonly GuideSectionKind[] {
  const written = new Set((guide?.sections ?? []).filter(sectionWritten).map((s) => s.kind));
  return detectIntents(question).filter((k) => !written.has(k) && guideSectionSpec(k) !== null);
}
