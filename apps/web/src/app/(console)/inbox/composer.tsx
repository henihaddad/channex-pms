"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate, ReplyDraft, ReplyPhrases } from "@pms/core";
import { Button, Select, Textarea } from "@/components/ui";
import {
  addNoteAction,
  previewTemplateAction,
  sendReplyAction,
  suggestReplyAction,
} from "./inbox.actions";

interface Props {
  threadId: string;
  propertyId: string;
  bookingId: string | null;
  guestFirstName: string;
  providerLabel: string;
  guestLanguage: string | null;
  templates: Array<MessageTemplate & { warnings: string[] }>;
  provider: string;
  canSend: boolean;
  /** Glue text for a drafted reply, already localised (spec 09 §9.3). */
  replyPhrases: ReplyPhrases;
  /** True when the thread has something from the guest to answer. */
  canSuggest: boolean;
  labels: {
    replyMode: string;
    noteMode: string;
    sendTo: string;
    saveNote: string;
    template: string;
    preview: string;
    noteHint: string;
    missing: string;
    switchConfirm: string;
    suggest: string;
    suggesting: string;
    draftedFromGuide: string;
    draftedByModel: string;
    warnSensitive: string;
    warnUnanswered: string;
    warnUnrecognised: string;
    guideLink: string;
  };
}

/**
 * MSG-3: two composers that share nothing but the thread id. The note form posts
 * to addNoteAction, which cannot produce a guest message; the guest form posts to
 * sendReplyAction. MSG-4: the send button names recipient and channel. MSG-5:
 * switching with text present asks first and keeps the text.
 */
export function Composer(p: Props) {
  const [mode, setMode] = useState<"guest" | "note">(p.canSend ? "guest" : "note");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [draft, setDraft] = useState<ReplyDraft | null>(null);
  const [pending, start] = useTransition();
  const [suggesting, startSuggest] = useTransition();
  const switchTo = (m: "guest" | "note") => {
    if (m === mode) return;
    if (text.trim() !== "" && !window.confirm(p.labels.switchConfirm)) return;
    setMode(m);
  };
  const applicable = p.templates.filter(
    (t) => !t.channelScope || t.channelScope.includes(p.provider),
  );
  const pick = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    start(async () => {
      const r = await previewTemplateAction({ templateId: id, bookingId: p.bookingId });
      if (r) {
        setText(r.text);
        setMissing(r.missing);
        setDraft(null);
      }
    });
  };
  /** MSG-6 still holds: this only fills the box. The send button is the one that sends. */
  const suggest = () => {
    startSuggest(async () => {
      const r = await suggestReplyAction({
        threadId: p.threadId,
        propertyId: p.propertyId,
        phrases: p.replyPhrases,
      });
      if (!r) return;
      setDraft(r);
      setTemplateId("");
      setMissing([]);
      if (r.body.trim()) setText(r.body);
    });
  };
  const warningLabel: Record<string, string> = {
    sensitive_before_window: p.labels.warnSensitive,
    unanswered_question: p.labels.warnUnanswered,
    unrecognised_question: p.labels.warnUnrecognised,
  };
  return (
    <div className="space-y-2" data-testid="composer" data-mode={mode}>
      <div className="flex flex-wrap gap-1">
        {p.canSend ? (
          <Button
            type="button"
            size="sm"
            variant={mode === "guest" ? "primary" : "ghost"}
            onClick={() => switchTo("guest")}
            data-testid="mode-guest"
          >
            {p.labels.replyMode}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={mode === "note" ? "secondary" : "ghost"}
          onClick={() => switchTo("note")}
          data-testid="mode-note"
        >
          {p.labels.noteMode}
        </Button>
      </div>
      {mode === "guest" ? (
        <form
          action={sendReplyAction}
          className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-3"
          data-testid="guest-composer"
          onSubmit={() => setText("")}
        >
          <input type="hidden" name="threadId" value={p.threadId} />
          <input type="hidden" name="propertyId" value={p.propertyId} />
          <input type="hidden" name="templateId" value={templateId} />
          <div className="flex items-center gap-2 text-xs">
            <Select
              label={p.labels.template}
              value={templateId}
              onChange={(v) => pick(v)}
              size="sm"
              testId="template-select"
            >
              <option value="">—</option>
              {applicable.map((t) => (
                <option key={t.id} value={t.id} title={t.warnings.join("; ")}>
                  {t.name} ({t.locale})
                </option>
              ))}
            </Select>
            {p.canSuggest ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={suggest}
                disabled={suggesting}
                data-testid="suggest-reply"
              >
                {suggesting ? p.labels.suggesting : p.labels.suggest}
              </Button>
            ) : null}
            {pending ? <span className="text-muted">{p.labels.preview}</span> : null}
            {missing.length ? (
              <span className="text-danger" data-testid="missing-vars">
                {p.labels.missing}: {missing.join(", ")}
              </span>
            ) : null}
          </div>
          {draft ? (
            <div
              className="rounded border border-accent/30 bg-surface px-2 py-1.5 text-xs"
              data-testid="reply-draft"
              data-origin={draft.origin}
            >
              <p className="font-medium">
                {draft.origin === "llm" ? p.labels.draftedByModel : p.labels.draftedFromGuide}
                {draft.sources.length > 0 ? ` · ${draft.sources.join(", ")}` : ""}
              </p>
              {draft.warnings.map((w) => (
                <p
                  key={w}
                  className="mt-1 text-warning-soft-foreground"
                  data-testid={`draft-warning-${w}`}
                >
                  {warningLabel[w] ?? w}
                  {w === "unanswered_question" ? (
                    <>
                      {" "}
                      <a
                        href={`/properties/${p.propertyId}/guide`}
                        className="underline"
                        data-testid="draft-guide-link"
                      >
                        {p.labels.guideLink}
                      </a>
                    </>
                  ) : null}
                </p>
              ))}
            </div>
          ) : null}
          <Textarea
            name="body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            className="w-full rounded border border-accent/40 bg-surface p-2 text-sm"
            data-testid="guest-body"
            placeholder={`${p.labels.sendTo} ${p.guestFirstName}…`}
          />
          <Button type="submit" data-testid="send-guest">
            {p.labels.sendTo} {p.guestFirstName} via {p.providerLabel}
          </Button>
        </form>
      ) : (
        <form
          action={addNoteAction}
          className="flex flex-col gap-2 rounded-2xl bg-warning-soft p-3"
          data-testid="note-composer"
          onSubmit={() => setText("")}
        >
          <input type="hidden" name="threadId" value={p.threadId} />
          <input type="hidden" name="propertyId" value={p.propertyId} />
          <p className="text-xs text-warning-soft-foreground">{p.labels.noteHint}</p>
          <Textarea
            name="body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            required
            className="w-full rounded border border-warning/50 bg-surface p-2 text-sm"
            data-testid="note-body"
          />
          <Button type="submit" variant="secondary" data-testid="save-note">
            {p.labels.saveNote}
          </Button>
        </form>
      )}
    </div>
  );
}
