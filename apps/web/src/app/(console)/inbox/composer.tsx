"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate } from "@pms/core";
import { Button, Select, Textarea } from "@/components/ui";
import { addNoteAction, previewTemplateAction, sendReplyAction } from "./inbox.actions";

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
  const [pending, start] = useTransition();
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
      }
    });
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
            {pending ? <span className="text-muted">{p.labels.preview}</span> : null}
            {missing.length ? (
              <span className="text-danger" data-testid="missing-vars">
                {p.labels.missing}: {missing.join(", ")}
              </span>
            ) : null}
          </div>
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
