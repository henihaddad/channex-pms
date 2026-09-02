import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertSendable, toOutbound, NoteNeverSentError } from "./guard.js";
import { firstResponseDue, matchesView, medianFirstResponseMinutes, slaState } from "./sla.js";
import { interpolate, pickVariant, promotionalWarnings } from "./templates.js";
import {
  guardAutomation,
  inQuietHours,
  nextAllowed,
  ruleApplies,
  scheduledAt,
} from "./automation.js";
import { parseInquiry } from "./inquiry.js";
import type { AutomationRule, GuestMessage, InternalNote, Thread } from "./types.js";

const guest: GuestMessage = {
  kind: "guest_message",
  threadId: "t",
  direction: "outbound",
  authorType: "staff",
  authorId: "u",
  body: "hi",
  sentAt: "2026-10-01T10:00:00Z",
  providerMessageId: null,
  deliveryState: "queued",
};
const note: InternalNote = {
  kind: "note",
  threadId: "t",
  authorId: "u",
  body: "guest is difficult",
  sentAt: "2026-10-01T10:00:00Z",
};

describe("MSG-6: notes never reach a provider", () => {
  it("refuses a note at runtime and only converts outbound guest messages", () => {
    expect(() => assertSendable(note)).toThrow(NoteNeverSentError);
    expect(() => toOutbound({ ...guest, direction: "inbound" })).toThrow(/outbound/);
    expect(toOutbound(guest, ["a1"])).toEqual({ threadId: "t", body: "hi", attachmentIds: ["a1"] });
    // structurally: a note has no direction and no deliveryState; a JSON object pretending to be a message must carry kind
    expect(() =>
      assertSendable({ ...note, direction: "outbound" } as unknown as InternalNote),
    ).toThrow(NoteNeverSentError);
  });
});

describe("SLA and views (spec 09 §9.1, §9.4)", () => {
  const base: Thread = {
    id: "t",
    propertyId: "p",
    provider: "booking_com",
    bookingId: "b",
    guestId: "g",
    kind: "booking",
    state: "open",
    unreadCount: 1,
    lastMessageAt: "2026-10-01T10:00:00Z",
    lastInboundAt: "2026-10-01T10:00:00Z",
    lastOutboundAt: null,
    firstResponseDueAt: "2026-10-01T10:30:00Z",
    assigneeId: null,
    snoozedUntil: null,
    tags: [],
    guestLanguage: "pt",
  };
  it("needs reply until staff answers; breaches after the deadline; business hours defer the deadline", () => {
    expect(slaState(base, "2026-10-01T10:10:00Z")).toEqual({
      needsReply: true,
      dueAt: "2026-10-01T10:30:00Z",
      remainingMinutes: 20,
      breached: false,
    });
    expect(slaState(base, "2026-10-01T11:00:00Z").breached).toBe(true);
    expect(
      slaState({ ...base, lastOutboundAt: "2026-10-01T10:05:00Z" }, "2026-10-01T11:00:00Z")
        .needsReply,
    ).toBe(false);
    expect(firstResponseDue("2026-10-01T10:00:00Z")).toBe("2026-10-01T10:30:00.000Z");
    expect(
      firstResponseDue("2026-10-01T22:00:00Z", undefined, {
        from: "09:00",
        to: "18:00",
        timezone: "UTC",
      }),
    ).toBe("2026-10-02T09:30:00.000Z");
  });
  it("views", () => {
    const now = "2026-10-01T10:10:00Z";
    expect(matchesView(base, "needs_reply", { nowIso: now, userId: "u" })).toBe(true);
    expect(matchesView(base, "breaching_sla", { nowIso: now, userId: "u" })).toBe(true);
    expect(matchesView(base, "unassigned", { nowIso: now, userId: "u" })).toBe(true);
    expect(
      matchesView({ ...base, assigneeId: "u" }, "assigned_to_me", { nowIso: now, userId: "u" }),
    ).toBe(true);
    expect(
      matchesView({ ...base, snoozedUntil: "2026-10-02T00:00:00Z" }, "needs_reply", {
        nowIso: now,
        userId: "u",
      }),
    ).toBe(false);
    expect(
      matchesView({ ...base, snoozedUntil: "2026-10-02T00:00:00Z" }, "snoozed", {
        nowIso: now,
        userId: "u",
      }),
    ).toBe(true);
    expect(
      matchesView({ ...base, kind: "inquiry", bookingId: null }, "inquiries", {
        nowIso: now,
        userId: "u",
      }),
    ).toBe(true);
    expect(
      matchesView(base, "arriving", {
        nowIso: now,
        userId: "u",
        arrivalDate: "2026-10-02",
        arrivalWindow: { from: "2026-10-01", to: "2026-10-02" },
      }),
    ).toBe(true);
    expect(
      medianFirstResponseMinutes([
        { inboundAt: "2026-10-01T10:00:00Z", repliedAt: "2026-10-01T10:10:00Z" },
        { inboundAt: "2026-10-01T11:00:00Z", repliedAt: "2026-10-01T11:30:00Z" },
      ]),
    ).toBe(20);
  });
});

describe("templates (spec 09 §9.3)", () => {
  it("interpolates, reports missing variables, picks the guest's locale, warns on promotions (AUTO-7)", () => {
    const r = interpolate(
      "Olá {{guest.first_name}}, chegada {{booking.arrival}}, wifi {{unit.wifi_name}}",
      {
        guest: { first_name: "Ana" },
        booking: {
          arrival: "2026-10-04",
          departure: "2026-10-06",
          nights: 2,
          total: "€240",
          reference: "ABC",
        },
        property: { name: "Alfama" },
      },
    );
    expect(r.text).toBe("Olá Ana, chegada 2026-10-04, wifi {{unit.wifi_name}}");
    expect(r.missing).toEqual(["unit.wifi_name"]);
    const variants = [
      {
        id: "1",
        name: "welcome",
        category: "arrival",
        locale: "en",
        channelScope: null,
        body: "Hi",
      },
      {
        id: "2",
        name: "welcome",
        category: "arrival",
        locale: "pt",
        channelScope: null,
        body: "Olá",
      },
    ];
    expect(pickVariant(variants, "pt-PT")?.locale).toBe("pt");
    expect(pickVariant(variants, "de")?.locale).toBe("en");
    expect(
      promotionalWarnings("Book direct next time for 10% off with promo code SUMMER"),
    ).toHaveLength(3);
    expect(promotionalWarnings("Your door code is 1234")).toEqual([]);
  });
});

describe("automation guards (AUTO-1..3, AUTO-6, access window)", () => {
  const rule: AutomationRule = {
    id: "r",
    name: "arrival",
    version: 1,
    trigger: "before_arrival",
    offsetDays: 1,
    atLocalTime: "17:00",
    templateId: "t",
    quietHours: { from: "22:00", to: "08:00" },
    enabled: true,
  };
  const ok = {
    rule,
    nowIso: "2026-10-03T15:00:00Z",
    timezone: "Europe/Lisbon",
    sentTodayToGuest: 0,
    sentDuringStayToGuest: 0,
    guestRepliedSinceLastAutomation: false,
    humanClosedLoop: false,
    propertyKillSwitch: false,
  };
  it("never sends inside quiet hours, over limits, after a guest reply, with the kill switch on, or before the access window", () => {
    expect(guardAutomation(ok)).toEqual({ allow: true, sendAt: "2026-10-03T15:00:00Z" });
    const night = guardAutomation({ ...ok, nowIso: "2026-10-03T02:00:00Z" });
    expect(night).toEqual({ allow: true, sendAt: "2026-10-03T07:00:00.000Z" }); // 08:00 Lisbon
    expect(guardAutomation({ ...ok, sentTodayToGuest: 1 })).toMatchObject({
      allow: false,
      reason: expect.stringContaining("AUTO-2"),
    });
    expect(guardAutomation({ ...ok, sentDuringStayToGuest: 4 })).toMatchObject({ allow: false });
    expect(guardAutomation({ ...ok, guestRepliedSinceLastAutomation: true })).toMatchObject({
      allow: false,
      reason: expect.stringContaining("AUTO-3"),
    });
    expect(
      guardAutomation({ ...ok, guestRepliedSinceLastAutomation: true, humanClosedLoop: true })
        .allow,
    ).toBe(true);
    expect(guardAutomation({ ...ok, propertyKillSwitch: true })).toMatchObject({
      allow: false,
      reason: expect.stringContaining("AUTO-6"),
    });
    const access = { ...ok, rule: { ...rule, trigger: "access_window" as const } };
    expect(guardAutomation({ ...access, accessValidFrom: null }).allow).toBe(false);
    expect(guardAutomation({ ...access, accessValidFrom: "2026-10-05T13:00:00Z" })).toMatchObject({
      allow: false,
      reason: "before the access window",
    });
    expect(guardAutomation({ ...access, accessValidFrom: "2026-10-04T13:00:00Z" }).allow).toBe(
      true,
    );
  });
  it("property: a permitted send is never inside quiet hours and never past the limits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 24 * 60 * 3 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 6 }),
        (minutes, qf, qt, today, stay) => {
          const nowIso = new Date(
            Date.parse("2026-10-01T00:00:00Z") + minutes * 60_000,
          ).toISOString();
          const quiet = {
            from: `${String(qf).padStart(2, "0")}:00`,
            to: `${String(qt).padStart(2, "0")}:00`,
          };
          const d = guardAutomation({
            ...ok,
            nowIso,
            rule: { ...rule, quietHours: quiet },
            sentTodayToGuest: today,
            sentDuringStayToGuest: stay,
          });
          if (d.allow) {
            expect(today).toBeLessThan(1);
            expect(stay).toBeLessThan(4);
            if (qf !== qt) expect(inQuietHours(d.sendAt, "Europe/Lisbon", quiet)).toBe(false);
            expect(Date.parse(d.sendAt)).toBeGreaterThanOrEqual(Date.parse(nowIso));
          }
        },
      ),
    );
  });
  it("schedules per trigger in property-local time and applies conditions", () => {
    const b = {
      bookingId: "b",
      propertyId: "p",
      provider: "airbnb",
      arrivalDate: "2026-10-10",
      departureDate: "2026-10-14",
      status: "new" as const,
      timezone: "Europe/Lisbon",
    };
    expect(scheduledAt(rule, b)).toBe("2026-10-09T16:00:00.000Z");
    expect(
      scheduledAt({ ...rule, trigger: "after_departure", offsetDays: 1, atLocalTime: "11:00" }, b),
    ).toBe("2026-10-15T10:00:00.000Z");
    expect(scheduledAt({ ...rule, trigger: "mid_stay" }, b)).toBe("2026-10-12T16:00:00.000Z");
    expect(
      scheduledAt({ ...rule, trigger: "mid_stay" }, { ...b, departureDate: "2026-10-12" }),
    ).toBeNull();
    expect(ruleApplies({ ...rule, conditions: { providers: ["booking_com"] } }, b)).toBe(false);
    expect(ruleApplies({ ...rule, conditions: { minNights: 5 } }, b)).toBe(false);
    expect(ruleApplies({ ...rule, trigger: "booking_cancelled" }, b)).toBe(false);
    expect(
      ruleApplies({ ...rule, trigger: "booking_cancelled" }, { ...b, status: "cancelled" }),
    ).toBe(true);
    expect(nextAllowed("2026-10-03T23:30:00Z", "UTC", { from: "22:00", to: "08:00" })).toBe(
      "2026-10-04T08:00:00.000Z",
    );
  });
});

describe("Airbnb inquiry cards (CXMSG-6)", () => {
  it("parses dates, guests and price with a 24 h deadline", () => {
    const c = parseInquiry(
      "Inquiry: 2026-11-01 to 2026-11-04, 3 guests. Total: €450 EUR",
      "2026-10-01T10:00:00Z",
    );
    expect(c).toEqual({
      checkIn: "2026-11-01",
      checkOut: "2026-11-04",
      guests: 3,
      priceText: "€450 EUR",
      kind: "inquiry",
      deadline: "2026-10-02T10:00:00.000Z",
    });
    expect(
      parseInquiry("Alteration request: 2026-11-02 to 2026-11-05", "2026-10-01T10:00:00Z").kind,
    ).toBe("alteration_request");
  });
});
