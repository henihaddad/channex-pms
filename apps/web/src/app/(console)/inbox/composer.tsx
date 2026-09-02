"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate } from "@pms/core";
import { Button } from "@/components/ui";
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
      <div className="flex gap-1 text-xs">
        {p.canSend ? (
          <button
            type="button"
            onClick={() => switchTo("guest")}
            className={`rounded-t px-3 py-1 ${mode === "guest" ? "bg-sky-100 font-semibold text-sky-900" : "bg-slate-100"}`}
            data-testid="mode-guest"
          >
            {p.labels.replyMode}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => switchTo("note")}
          className={`rounded-t px-3 py-1 ${mode === "note" ? "bg-amber-100 font-semibold text-amber-900" : "bg-slate-100"}`}
          data-testid="mode-note"
        >
          {p.labels.noteMode}
        </button>
      </div>
      {mode === "guest" ? (
        <form
          action={sendReplyAction}
          className="space-y-2 rounded-b-lg rounded-tr-lg border border-sky-200 bg-sky-50 p-3"
          data-testid="guest-composer"
          onSubmit={() => setText("")}
        >
          <input type="hidden" name="threadId" value={p.threadId} />
          <input type="hidden" name="propertyId" value={p.propertyId} />
          <input type="hidden" name="templateId" value={templateId} />
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="template">{p.labels.template}</label>
            <select
              id="template"
              value={templateId}
              onChange={(e) => pick(e.target.value)}
              className="h-7 rounded border border-slate-300 bg-white px-1"
              data-testid="template-select"
            >
              <option value="">—</option>
              {applicable.map((t) => (
                <option key={t.id} value={t.id} title={t.warnings.join("; ")}>
                  {t.name} ({t.locale})
                </option>
              ))}
            </select>
            {pending ? <span className="text-slate-500">{p.labels.preview}</span> : null}
            {missing.length ? (
              <span className="text-rose-700" data-testid="missing-vars">
                {p.labels.missing}: {missing.join(", ")}
              </span>
            ) : null}
          </div>
          <textarea
            name="body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            className="w-full rounded border border-sky-300 bg-white p-2 text-sm"
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
          className="space-y-2 rounded-b-lg rounded-tr-lg border border-amber-300 bg-amber-50 p-3"
          data-testid="note-composer"
          onSubmit={() => setText("")}
        >
          <input type="hidden" name="threadId" value={p.threadId} />
          <input type="hidden" name="propertyId" value={p.propertyId} />
          <p className="text-xs text-amber-900">{p.labels.noteHint}</p>
          <textarea
            name="body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            required
            className="w-full rounded border border-amber-300 bg-white p-2 text-sm"
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
