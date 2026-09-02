/** Channel code (`booking_com`, `airbnb`, `expedia`, `direct`, …); open string so new adapters need no core change. */
export type ThreadProvider = string;
export type ThreadState = "open" | "closed" | "no_reply_needed";
export type ThreadKind = "booking" | "inquiry";

export interface Thread {
  id: string;
  propertyId: string;
  provider: ThreadProvider;
  bookingId: string | null;
  guestId: string | null;
  kind: ThreadKind;
  state: ThreadState;
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  firstResponseDueAt: string | null;
  assigneeId: string | null;
  snoozedUntil: string | null;
  tags: string[];
  guestLanguage: string | null;
}

/**
 * MSG-6: a guest message and an internal note are different types. Nothing
 * that talks to a provider accepts an InternalNote; the compiler refuses it and
 * `assertSendable` refuses it at runtime for anything that slipped past typing.
 */
export interface GuestMessage {
  kind: "guest_message";
  threadId: string;
  direction: "inbound" | "outbound";
  authorType: "guest" | "staff" | "system" | "automation";
  authorId: string | null;
  body: string;
  sentAt: string;
  providerMessageId: string | null;
  deliveryState: "queued" | "sent" | "failed" | "received";
  templateId?: string | null;
  automationRuleId?: string | null;
}
export interface InternalNote {
  kind: "note";
  threadId: string;
  authorId: string;
  body: string;
  sentAt: string;
}
export type ThreadEntry = GuestMessage | InternalNote;

export interface OutboundDraft {
  threadId: string;
  body: string;
  attachmentIds?: string[];
}

export interface SlaTargets {
  firstResponseMinutes: number;
  resolutionHours: number;
}
export const DEFAULT_SLA: SlaTargets = { firstResponseMinutes: 30, resolutionHours: 24 };

export type InboxView =
  | "needs_reply"
  | "breaching_sla"
  | "assigned_to_me"
  | "unassigned"
  | "inquiries"
  | "arriving"
  | "in_house"
  | "snoozed"
  | "closed"
  | "all";

export interface ChannelCapabilities {
  attachments: boolean;
  closeThread: boolean;
  noReplyNeeded: boolean;
  messaging: boolean;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  locale: string;
  channelScope: string[] | null;
  body: string;
}

export interface TemplateContext {
  guest: { first_name: string; last_name?: string; language?: string };
  booking?: {
    arrival: string;
    departure: string;
    nights: number;
    total: string;
    reference: string;
    balance?: string;
  };
  unit?: {
    name?: string;
    wifi_name?: string;
    wifi_password?: string;
    access_instructions?: string;
  };
  property: {
    name: string;
    address?: string;
    check_in_time?: string;
    check_out_time?: string;
    contact_phone?: string;
  };
  access?: { code?: string; valid_from?: string; valid_to?: string };
}

export type AutomationTrigger =
  | "booking_confirmed"
  | "before_arrival"
  | "access_window"
  | "checked_in"
  | "mid_stay"
  | "checkout_day"
  | "after_departure"
  | "inquiry_received"
  | "message_outside_hours"
  | "booking_cancelled";

export interface AutomationRule {
  id: string;
  name: string;
  version: number;
  trigger: AutomationTrigger;
  /** Days relative to the anchor date (negative = before arrival, positive = after departure); hour local. */
  offsetDays?: number;
  atLocalTime?: string;
  conditions?: {
    providers?: string[];
    propertyIds?: string[];
    minNights?: number;
    maxNights?: number;
  };
  templateId: string;
  quietHours?: { from: string; to: string };
  enabled: boolean;
}

export interface GuardContext {
  rule: AutomationRule;
  nowIso: string;
  timezone: string;
  /** Automated messages already sent to this guest today and during this stay. */
  sentTodayToGuest: number;
  sentDuringStayToGuest: number;
  /** A guest replied after the last automated message on the thread (AUTO-3). */
  guestRepliedSinceLastAutomation: boolean;
  humanClosedLoop: boolean;
  /** Per-property kill switch (AUTO-6). */
  propertyKillSwitch: boolean;
  /** For access_window: the credential's validity start; never send before it. */
  accessValidFrom?: string | null;
  limits?: { perDay: number; perStay: number };
}
