import type { LlmDraftInput, LlmProvider } from "./types.js";

/**
 * The provider a deployment has until an operator wires a real one (spec 09 §9.3): it
 * writes nothing, so `suggestReply` falls back to the guide. Having it means the AI path
 * is exercised in tests and self-hosters are never asked to configure a model to use the
 * feature.
 */
export class NoLlmProvider implements LlmProvider {
  readonly name = "none";
  async draft(): Promise<string | null> {
    return null;
  }
}

/**
 * A deterministic stand-in for a model, for tests and demos: it restates the guide
 * sections it was handed, in the order given. No network, no randomness, and it receives
 * exactly what a real provider would — which is what makes it useful for proving that no
 * guest PII is in `LlmDraftInput`.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly name = "fake";
  readonly calls: LlmDraftInput[] = [];
  constructor(private readonly prefix = "Thanks for asking —") {}
  async draft(input: LlmDraftInput): Promise<string | null> {
    this.calls.push(input);
    if (input.guide.length === 0) return null;
    return [`${this.prefix} here is what you need:`, ...input.guide.map((g) => g.text)].join(
      "\n\n",
    );
  }
}
