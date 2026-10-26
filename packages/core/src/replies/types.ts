import type { GuideSectionKind } from "../guides/types.js";

/**
 * Suggested replies (spec 09 §9.3): the guide, pointed at one guest's question.
 *
 * The order matters. The guide is tried first, because a manager who has written
 * "Space 4, under the block" has already answered the parking question better than any
 * model would, in their own words and their guest's language. A model is an optional
 * second pass for the questions the guide does not cover.
 *
 * Persona: whoever works the inbox (spec 02 `property_manager`, `guest_services`).
 */

/** Why a draft needs a second look before it is sent. The editor turns these into sentences. */
export type ReplyWarning =
  /** The draft quotes a section the portal would still be holding back (GUIDE-2). */
  | "sensitive_before_window"
  /** We recognised the question and the guide does not answer it: write it once. */
  | "unanswered_question"
  /** We could not tell what was asked, so the draft is a starting point only. */
  | "unrecognised_question";

export interface ReplyDraft {
  /** `guide` when the manager's own words answered it, `llm` when a model wrote it. */
  origin: "guide" | "llm";
  /** What we think was asked, best match first. Empty when nothing was recognised. */
  intents: readonly GuideSectionKind[];
  /** The guide sections the draft actually used. */
  sources: readonly GuideSectionKind[];
  body: string;
  warnings: readonly ReplyWarning[];
  /**
   * Always true, and in the type so it cannot be forgotten: a draft is labelled and a
   * human presses send (spec 09 §9.3). Nothing in this module sends anything.
   */
  requiresHuman: true;
}

/** Glue text, already localised by the caller — core holds no copy and no i18n. */
export interface ReplyPhrases {
  /** Opening line with the guest's name already in it, e.g. "Hi Ana," */
  greeting: string;
  /** Closing line, e.g. "Let me know if you need anything else." */
  closing: string;
  /** Label per `<kind>_<field>` key, e.g. `{ wifi_name: "Network" }`. */
  fieldLabels?: Readonly<Record<string, string>>;
}

/**
 * What a model is given. Deliberately narrow: there is no guest name, email, phone or
 * message history here, so the spec's "no guest PII leaves the deployment" holds by
 * construction rather than by review (spec 09 §9.3, spec 13 §13.4). The guest's own
 * question is the one free-text field, and it is what they typed.
 */
export interface LlmDraftInput {
  question: string;
  /** The guide sections believed to answer it, as the manager wrote them. */
  guide: readonly { kind: GuideSectionKind; text: string }[];
  /** Stay facts without a person attached. */
  stay?: { arrival: string; departure: string; nights: number; propertyName: string };
  locale: string;
}

/**
 * The AI port (spec 09 §9.3, Q12). Off by default; a self-hoster may point it at a local
 * model or leave it unset, in which case the guide alone answers. An implementation that
 * cannot help returns `null` and the guide composition is used instead.
 */
export interface LlmProvider {
  readonly name: string;
  draft(input: LlmDraftInput): Promise<string | null>;
}
