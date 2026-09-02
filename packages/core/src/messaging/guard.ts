import type { GuestMessage, InternalNote, OutboundDraft, ThreadEntry } from "./types.js";

/**
 * MSG-6 at the domain layer: the only way to obtain an OutboundDraft is from a
 * GuestMessage. An InternalNote has no `direction`, no `deliveryState` and a
 * different `kind`; the runtime check covers JSON that lost its types.
 */
export function assertSendable(entry: ThreadEntry): GuestMessage {
  if (entry.kind !== "guest_message") throw new NoteNeverSentError();
  if (entry.direction !== "outbound") throw new Error("only outbound messages are sent");
  return entry;
}

export function toOutbound(entry: ThreadEntry, attachmentIds?: string[]): OutboundDraft {
  const m = assertSendable(entry);
  return { threadId: m.threadId, body: m.body, ...(attachmentIds ? { attachmentIds } : {}) };
}

export class NoteNeverSentError extends Error {
  constructor() {
    super("internal notes are never transmitted to a provider (MSG-6)");
    this.name = "NoteNeverSentError";
  }
}

export const isNote = (e: ThreadEntry): e is InternalNote => e.kind === "note";
