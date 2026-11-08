"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate, ReplyDraft, ReplyPhrases } from "@pms/core";
import { Button, Select, Textarea, cn } from "@/components/ui";
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
    draftNote: string;
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
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold transition-colors",
      active
        ? "bg-accent text-accent-foreground"
        : "border border-[#d5d9d7] text-muted hover:text-foreground",
    );
  return (
    <div className="flex flex-col gap-2.5" data-testid="composer" data-mode={mode}>
      <div className="flex flex-wrap items-center gap-2">
        {p.canSend ? (
          <button
            type="button"
            className={chip(mode === "guest")}
            onClick={() => switchTo("guest")}
            data-testid="mode-guest"
          >
            {p.labels.replyMode}
          </button>
        ) : null}
        <button
          type="button"
          className={chip(mode === "note")}
          onClick={() => switchTo("note")}
          data-testid="mode-note"
        >
          {p.labels.noteMode}
        </button>
        <span className="flex-1" />
        {mode === "guest" && p.canSuggest ? (
          <button
            type="button"
            onClick={suggest}
            disabled={suggesting}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-accent px-2.5 text-xs font-semibold text-accent hover:bg-accent-soft/50 disabled:opacity-60"
            data-testid="suggest-reply"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
            </svg>
            {suggesting ? p.labels.suggesting : p.labels.suggest}
          </button>
        ) : null}
        {mode === "guest" ? (
          <Select
            aria-label={p.labels.template}
            value={templateId}
            onChange={(v) => pick(v)}
            size="sm"
            testId="template-select"
            className="w-44 [&_select]:h-7 [&_select]:rounded-full [&_select]:text-xs"
          >
            <option value="">{p.labels.template}…</option>
            {applicable.map((t) => (
              <option key={t.id} value={t.id} title={t.warnings.join("; ")}>
                {t.name} ({t.locale})
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      {mode === "guest" ? (
        <form
          action={sendReplyAction}
          className="flex flex-col gap-2.5"
          data-testid="guest-composer"
          onSubmit={() => setText("")}
        >
          <input type="hidden" name="threadId" value={p.threadId} />
          <input type="hidden" name="propertyId" value={p.propertyId} />
          <input type="hidden" name="templateId" value={templateId} />
          {pending ? <p className="text-xs text-muted">{p.labels.preview}</p> : null}
          {missing.length ? (
            <p className="text-xs text-danger" data-testid="missing-vars">
              {p.labels.missing}: {missing.join(", ")}
            </p>
          ) : null}
          {draft ? (
            <div
              className="rounded-xl border border-[#c6e8e3] bg-[#f0faf8] px-3 py-2.5 text-xs text-accent"
              data-testid="reply-draft"
              data-origin={draft.origin}
            >
              <p>
                <strong>
                  {draft.origin === "llm" ? p.labels.draftedByModel : p.labels.draftedFromGuide}
                  {draft.sources.length > 0 ? ` · ${draft.sources.join(", ")}.` : "."}
                </strong>{" "}
                {p.labels.draftNote}
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
            onKeyDown={(e) => {
              // ⌘↵ / Ctrl+↵ sends, as the shortcuts page says
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={4}
            required
            aria-label={p.labels.replyMode}
            data-testid="guest-body"
            placeholder={`${p.labels.sendTo} ${p.guestFirstName}…`}
          />
          <div className="flex justify-end">
            <Button type="submit" size="lg" data-testid="send-guest">
              {p.labels.sendTo} {p.guestFirstName} via {p.providerLabel}
            </Button>
          </div>
        </form>
      ) : (
        <form
          action={addNoteAction}
          className="flex flex-col gap-2.5 rounded-xl bg-warning-soft p-3"
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
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={3}
            required
            data-testid="note-body"
          />
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" data-testid="save-note">
              {p.labels.saveNote}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
