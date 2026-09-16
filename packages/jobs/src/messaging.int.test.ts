import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  AuthorizationError,
  createProperty,
  FakeClock,
  FakeLockProvider,
  Id,
  ingestProperty,
  NoteNeverSentError,
  assertSendable,
  type Crypto,
} from "@pms/core";
import { FakeProvider } from "@pms/connectivity";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  BookingRepositoryPerCall,
  DrizzleChannelRepository,
  DrizzleMessagingRepository,
  DrizzlePropertyRepository,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import { issueCredential } from "./operations.js";
import {
  deliverOutbound,
  firstResponseKpi,
  runAutomation,
  syncReviews,
  pollThreads,
  syncThreads,
} from "./messaging.js";

/**
 * M4 exit (spec 15): a guest message appears after sync with an unread count and
 * an SLA deadline; a duplicate webhook or a re-sync adds nothing; a failed
 * provider send renders `failed`, never delivered; a note has no path to the
 * provider (MSG-6); automation fires once per booking, delivers the door code
 * only inside its window and again after rotation, and never past the guest's
 * limits; the first-response KPI is measurable.
 */
let handle: DbHandle;
const ORG = Id.next();
const STAFF = Id.next();
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-10-01T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const fake = new FakeProvider({
  seed: 7,
  // the third send to the provider fails hard (a 5xx that keeps failing until attempts run out)
  rules: [{ op: "messages.send", fault: "5xx", times: 0 }],
});
fake.nowSource = () => clock.now().toString();
const mails: Array<{ to: string; body: string }> = [];
const deps = {
  provider: fake,
  clock,
  crypto,
  log,
  mailer: {
    send: async (m: { to: string; params: Record<string, string> }) => {
      mails.push({ to: m.to, body: m.params.body ?? "" });
    },
  },
};
let propertyId: string;
let roomTypeId: string;
let ratePlanId: string;
let unitId: string;
let remotePropertyId: string;
const repo = <T>(fn: (r: DrizzleMessagingRepository) => Promise<T>) =>
  asSystem(handle.db, ORG, (tx) => fn(new DrizzleMessagingRepository(tx, ORG, crypto)));

async function ingest(): Promise<void> {
  const r = new BookingRepositoryPerCall(handle.db, ORG, crypto);
  await ingestProperty({ provider: fake, repo: r, clock, orgId: ORG, log }, propertyId, {
    dedupeKey: `t:${String(clock.now().epochMilliseconds)}`,
    requestId: "t",
  });
}
const messages = (threadId: string) =>
  asSystem(handle.db, ORG, (tx) =>
    rawRows<{
      kind: string;
      direction: string | null;
      author_type: string;
      delivery_state: string | null;
      body_enc: string;
      automation_rule_name: string | null;
    }>(
      tx,
      sql`select kind, direction, author_type, delivery_state, body_enc, automation_rule_name from message where thread_id = ${threadId} order by sent_at, created_at`,
    ),
  );

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, async (tx) => {
    await tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-msg", country: "PT", defaultCurrency: "EUR" });
    await tx.insert(schema.user).values({
      id: STAFF,
      email: "staff@example.com",
      name: "Sam Staff",
      passwordHash: "x",
      locale: "en",
    });
  });
  const created = await withTenant(
    handle.db,
    { orgId: ORG, actor: { type: "system", id: "t" } },
    (tx) =>
      createProperty(
        {
          repo: new DrizzlePropertyRepository(tx, ORG),
          clock,
          orgId: ORG,
          horizonDays: 60,
          webhookCredentials: async () => ({ token: "tok-msg", secretSealed: "s:x" }),
        },
        { title: "Alfama Loft", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
      ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;
  unitId = created.value.units[0]!.id;
  // the fake addresses threads by the provider-side property id; local ids double as remote ids here
  remotePropertyId = propertyId;
  await asSystem(handle.db, ORG, (tx) =>
    tx.update(schema.property).set({ state: "live", channexPropertyId: remotePropertyId }),
  );
});
afterAll(() => handle.close());

describe("thread sync (CXMSG-2/3)", () => {
  let threadId: string;
  let bookingId: string;

  it("a guest message arrives, is stored once, raises unread and starts the SLA clock", async () => {
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-10-05",
      departureDate: "2026-10-08",
      days: { "2026-10-05": 10000, "2026-10-06": 10000, "2026-10-07": 10000 },
    });
    await ingest();
    const channexBookingId = fake.ledger.emitted[0]!.bookingId;
    fake.emitGuestMessage({
      propertyId: remotePropertyId,
      bookingId: channexBookingId,
      body: "Hi! Can we check in early, around 11?",
      guestName: "Ana Guest",
      guestLanguage: "pt",
    });
    // duplicate webhook + a second pull: the second sync must add nothing
    const first = await syncThreads({ db: handle.db, ...deps }, { orgId: ORG, propertyId });
    const second = await syncThreads({ db: handle.db, ...deps }, { orgId: ORG, propertyId });
    expect(first).toEqual({ threads: 1, newInbound: 1 });
    expect(second.newInbound).toBe(0);
    const rows = await repo((r) =>
      r.list({
        view: "needs_reply",
        userId: STAFF,
        nowIso: clock.now().toString(),
        today: "2026-10-01",
      }),
    );
    expect(rows).toHaveLength(1);
    threadId = rows[0]!.id;
    bookingId = rows[0]!.bookingId!;
    expect(rows[0]!.unreadCount).toBe(1);
    expect(rows[0]!.guestName).toBe("Ana Guest");
    expect(rows[0]!.sla.needsReply).toBe(true);
    expect(rows[0]!.sla.remainingMinutes).toBe(30);
    expect(rows[0]!.arrivalDate).toBe("2026-10-05");
    expect(await messages(threadId)).toHaveLength(1);
  });

  it("a staff reply is queued, delivered through the provider and matched on the next sync; the KPI sees it", async () => {
    clock.advance({ minutes: 7 });
    await repo((r) =>
      r.queueGuestMessage(threadId, {
        authorType: "staff",
        authorId: STAFF,
        body: "Olá Ana, early check-in at 11 is fine.",
        sentAt: clock.now().toString(),
      }),
    );
    const d = await deliverOutbound({ db: handle.db, ...deps }, ORG);
    expect(d).toEqual({ sent: 1, failed: 0, retried: 0 });
    expect(fake.ledger.messagesSent).toHaveLength(1);
    await syncThreads({ db: handle.db, ...deps }, { orgId: ORG, propertyId });
    const ms = await messages(threadId);
    expect(ms.map((m) => [m.direction, m.delivery_state])).toEqual([
      ["inbound", "received"],
      ["outbound", "sent"],
    ]);
    const kpi = await asSystem(handle.db, ORG, (tx) =>
      firstResponseKpi(tx, ORG, crypto, "2026-09-01T00:00:00Z"),
    );
    expect(kpi.overall).toBe(7);
    expect(kpi.byChannel[0]).toMatchObject({ provider: "booking_com", median: 7, n: 1 });
    const rows = await repo((r) =>
      r.list({
        view: "needs_reply",
        userId: STAFF,
        nowIso: clock.now().toString(),
        today: "2026-10-01",
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it("a failed provider send is rendered failed, never as delivered; a retry re-queues it", async () => {
    fake.plan.rules[0]!.times = 10;
    const id = await repo((r) =>
      r.queueGuestMessage(threadId, {
        authorType: "staff",
        authorId: STAFF,
        body: "The code follows shortly.",
        sentAt: clock.now().toString(),
      }),
    );
    let last = { sent: 0, failed: 0, retried: 0 };
    for (let i = 0; i < 6; i++) last = await deliverOutbound({ db: handle.db, ...deps }, ORG);
    expect(last).toEqual({ sent: 0, failed: 0, retried: 0 });
    const [m] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ delivery_state: string; attempts: number; delivery_error: string }>(
        tx,
        sql`select delivery_state, attempts, delivery_error from message where id = ${id}`,
      ),
    );
    expect(m!.delivery_state).toBe("failed");
    expect(m!.attempts).toBe(5);
    expect(m!.delivery_error).toContain("5xx");
    expect(fake.ledger.messagesSent).toHaveLength(1);
    fake.plan.rules[0]!.times = 0;
    await repo((r) => r.retry(id));
    expect(await deliverOutbound({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 1,
      failed: 0,
      retried: 0,
    });
  });

  it("MSG-6: an internal note is stored without direction or delivery state and no delivery path can pick it up", async () => {
    await repo((r) =>
      r.addNote(threadId, STAFF, "VIP: owner's cousin, be nice", clock.now().toString()),
    );
    const before = fake.ledger.messagesSent.length;
    expect(await deliverOutbound({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 0,
      failed: 0,
      retried: 0,
    });
    expect(fake.ledger.messagesSent).toHaveLength(before);
    expect(await repo((r) => r.queuedOutbound())).toHaveLength(0);
    // the storage layer refuses a note that looks deliverable
    await expect(
      asSystem(handle.db, ORG, (tx) =>
        tx.insert(schema.message).values({
          id: Id.next(),
          orgId: ORG,
          threadId,
          kind: "note",
          direction: "outbound",
          authorType: "staff",
          authorId: STAFF,
          bodyEnc: "s:leak",
          deliveryState: "queued",
          sentAt: clock.now().toString(),
        }),
      ),
    ).rejects.toThrow();
    // and the domain layer refuses it too
    expect(() =>
      assertSendable({
        kind: "note",
        threadId,
        authorId: STAFF,
        body: "x",
        sentAt: clock.now().toString(),
      }),
    ).toThrow(NoteNeverSentError);
    const detail = await repo((r) => r.detail(threadId, clock.now().toString()));
    expect(detail!.messages.map((m) => m.kind)).toEqual([
      "guest_message",
      "guest_message",
      "guest_message",
      "note",
    ]);
    expect(detail!.booking).toMatchObject({ arrivalDate: "2026-10-05", previousStays: 0 });
  });

  it("automation: fires once per booking, labels the message with rule and version, delivers the door code only inside its window and again after rotation, and stops after a guest reply", async () => {
    const welcome = await repo((r) =>
      r.saveTemplate({
        name: "Welcome",
        category: "arrival",
        locale: "en",
        channelScope: null,
        body: "Hi {{guest.first_name}}, thanks for booking {{property.name}} from {{booking.arrival}}.",
        warnings: [],
        createdBy: STAFF,
      }),
    );
    await repo((r) =>
      r.saveTemplate({
        name: "Welcome",
        category: "arrival",
        locale: "pt",
        channelScope: null,
        body: "Olá {{guest.first_name}}, obrigado por reservar {{property.name}}.",
        warnings: [],
        createdBy: STAFF,
      }),
    );
    const code = await repo((r) =>
      r.saveTemplate({
        name: "Door code",
        category: "access",
        locale: "en",
        channelScope: null,
        body: "Your door code is {{access.code}}, valid from {{access.valid_from}}.",
        warnings: [],
        createdBy: STAFF,
      }),
    );
    const welcomeRule = await repo((r) =>
      r.saveRule({
        name: "Thank you on booking",
        trigger: "booking_confirmed",
        offsetDays: null,
        atLocalTime: null,
        conditions: {},
        templateId: welcome,
        quietFrom: null,
        quietTo: null,
        createdBy: STAFF,
      }),
    );
    const codeRule = await repo((r) =>
      r.saveRule({
        name: "Door code delivery",
        trigger: "access_window",
        offsetDays: null,
        atLocalTime: null,
        conditions: {},
        templateId: code,
        quietFrom: "22:00",
        quietTo: "08:00",
        createdBy: STAFF,
      }),
    );
    await repo((r) => r.setRuleEnabled(welcomeRule, true));
    await repo((r) => r.setRuleEnabled(codeRule, true));

    // a fresh booking (the first one is older than a day: enabling a rule never blasts history)
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-10-12",
      departureDate: "2026-10-14",
      days: { "2026-10-12": 9000, "2026-10-13": 9000 },
    });
    await ingest();
    // both bookings were confirmed within the last day: the older one (thread already answered by staff) and the new one
    const r1 = await runAutomation({ db: handle.db, ...deps }, ORG);
    expect(r1).toEqual({ sent: 2, skipped: 0, failed: 0 });
    const r2 = await runAutomation({ db: handle.db, ...deps }, ORG);
    expect(r2).toEqual({ sent: 0, skipped: 0, failed: 0 });
    const [b2] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ id: string }>(tx, sql`select id from booking where arrival_date = '2026-10-12'`),
    );
    const t2 = (await repo((r) => r.threadForBooking(b2!.id)))!;
    let ms = await messages(t2.id);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({
      author_type: "automation",
      delivery_state: "sent",
      automation_rule_name: "Thank you on booking",
    });
    expect(ms[0]!.body_enc).toContain("thanks for booking Alfama Loft from 2026-10-12");
    // the provider opened a thread for the booking-addressed send and the next sync adopts it
    await syncThreads({ db: handle.db, ...deps }, { orgId: ORG, propertyId });
    expect((await repo((r) => r.threadForBooking(b2!.id)))!.providerThreadId).not.toMatch(
      /^booking:/,
    );

    // the door code: nothing before the window even though the credential exists
    await asSystem(handle.db, ORG, (tx) =>
      issueCredential(
        { db: handle.db, clock, crypto, lock: new FakeLockProvider(() => 0.3), log },
        tx,
        ORG,
        {
          propertyId,
          bookingId: b2!.id,
          unitId,
          type: "smart_lock",
          timezone: "Europe/Lisbon",
          arrivalDate: "2026-10-12",
          departureDate: "2026-10-14",
          issuedBy: "test",
        },
      ),
    );
    expect(await runAutomation({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    // 2026-10-11 14:00 Lisbon (13:00Z): window opened at 13:00Z the day before arrival
    clock.set("2026-10-11T13:30:00Z");
    expect(await runAutomation({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    ms = await messages(t2.id);
    expect(ms.at(-1)!.body_enc).toMatch(/Your door code is \d{6}/);
    const [cred] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ delivery_state: string }>(
        tx,
        sql`select delivery_state from access_credential where booking_id = ${b2!.id} and revoked_at is null`,
      ),
    );
    expect(cred!.delivery_state).toBe("delivered");
    // AUTO-2: a second automated message the same local day is refused (daily limit 1)
    expect(await runAutomation({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
    });

    // rotation: a new credential means a new window and a new delivery, next day
    await asSystem(handle.db, ORG, (tx) =>
      tx.execute(
        sql`update access_credential set revoked_at = now(), revoke_reason = 'rotated' where booking_id = ${b2!.id}`,
      ),
    );
    clock.set("2026-10-12T09:00:00Z");
    await asSystem(handle.db, ORG, (tx) =>
      issueCredential(
        { db: handle.db, clock, crypto, lock: new FakeLockProvider(() => 0.9), log },
        tx,
        ORG,
        {
          propertyId,
          bookingId: b2!.id,
          unitId,
          type: "smart_lock",
          timezone: "Europe/Lisbon",
          arrivalDate: "2026-10-12",
          departureDate: "2026-10-14",
          issuedBy: "test",
        },
      ),
    );
    expect(await runAutomation({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 1,
      skipped: 0,
      failed: 0,
    });

    // AUTO-3: the guest replies; the next scheduled automation hands over to a human
    const t2remote = (await repo((r) => r.threadForBooking(b2!.id)))!;
    fake.emitGuestMessage({
      propertyId: remotePropertyId,
      threadId: t2remote.providerThreadId,
      body: "Thanks! One more thing: is there parking?",
    });
    await syncThreads({ db: handle.db, ...deps }, { orgId: ORG, propertyId });
    const checkout = await repo((r) =>
      r.saveRule({
        name: "Checkout info",
        trigger: "checkout_day",
        offsetDays: null,
        atLocalTime: "08:00",
        conditions: {},
        templateId: welcome,
        quietFrom: null,
        quietTo: null,
        createdBy: STAFF,
      }),
    );
    await repo((r) => r.setRuleEnabled(checkout, true));
    clock.set("2026-10-14T08:30:00Z");
    const r3 = await runAutomation({ db: handle.db, ...deps }, ORG);
    expect(r3).toEqual({ sent: 0, skipped: 1, failed: 0 });
    const runs = await repo((r) => r.runs());
    expect(runs[0]).toMatchObject({ ruleName: "Checkout info", state: "skipped" });
    expect(runs[0]!.reason).toContain("AUTO-3");
    // AUTO-4: every automated message names its rule and version
    const detail = await repo((r) => r.detail(t2.id, clock.now().toString()));
    expect(
      detail!.messages
        .filter((m) => m.authorType === "automation")
        .every((m) => m.automationRuleName && m.automationRuleVersion === 1),
    ).toBe(true);
  });

  it("AUTO-6: the property kill switch stops every automation instantly", async () => {
    await repo((r) => r.setKillSwitch(propertyId, true));
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-10-20",
      departureDate: "2026-10-21",
      days: { "2026-10-20": 9000 },
      otaName: "Website",
    });
    await ingest();
    const r = await runAutomation({ db: handle.db, ...deps }, ORG);
    expect(r.sent).toBe(0);
    expect(r.skipped).toBeGreaterThan(0);
    await repo((rr) => rr.setKillSwitch(propertyId, false));
  });

  it("a direct thread goes out over mail, not the provider", async () => {
    const [b] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ id: string; channex_booking_id: string; guest_id: string }>(
        tx,
        sql`select id, channex_booking_id, guest_id from booking where arrival_date = '2026-10-20'`,
      ),
    );
    const direct = (await repo((r) => r.bookingsForAutomation("2026-10-14", 2, 14))).find(
      (x) => x.bookingId === b!.id,
    )!;
    expect(direct.provider).toBe("direct");
    const tid = await repo((r) => r.ensureThreadForBooking(direct));
    await repo((r) =>
      r.queueGuestMessage(tid, {
        authorType: "staff",
        authorId: STAFF,
        body: "See you soon",
        sentAt: clock.now().toString(),
      }),
    );
    const before = fake.ledger.messagesSent.length;
    expect(await deliverOutbound({ db: handle.db, ...deps }, ORG)).toEqual({
      sent: 1,
      failed: 0,
      retried: 0,
    });
    expect(fake.ledger.messagesSent).toHaveLength(before);
    expect(mails.at(-1)).toMatchObject({ body: "See you soon" });
  });

  it("CXMSG-1: a 403 on the thread list names the missing Messages app once, and the gap closes on the next good sync", async () => {
    const forbidden = new FakeProvider();
    forbidden.listThreads = async () => {
      throw new AuthorizationError("Forbidden", { op: "message_threads.list" });
    };
    const events = () =>
      asSystem(handle.db, ORG, (tx) =>
        new DrizzleChannelRepository(tx, ORG).listEvents({ propertyId, openOnly: true }),
      );
    await pollThreads({ db: handle.db, ...deps, provider: forbidden }, ORG);
    await pollThreads({ db: handle.db, ...deps, provider: forbidden }, ORG);
    const open = (await events()).filter((e) => e.type === "messages_app_missing");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ severity: "p2", connectionId: null });
    expect(open[0]?.message).toContain("Alfama Loft");
    expect(open[0]?.message).toContain("Channex Messages");
    await pollThreads({ db: handle.db, ...deps }, ORG);
    expect((await events()).filter((e) => e.type === "messages_app_missing")).toHaveLength(0);
  });

  it("reviews sync once and a response reaches the OTA", async () => {
    fake.emitReview({
      propertyId: remotePropertyId,
      bookingId: fake.ledger.emitted[0]!.bookingId,
      rating: 9,
      text: "Lovely flat",
    });
    expect(await syncReviews({ db: handle.db, ...deps }, { orgId: ORG, propertyId })).toEqual({
      reviews: 1,
      created: 1,
    });
    expect(
      (await syncReviews({ db: handle.db, ...deps }, { orgId: ORG, propertyId })).created,
    ).toBe(0);
    const [rv] = await repo((r) => r.listReviews({}));
    expect(rv).toMatchObject({
      rating: 9,
      provider: "booking_com",
      responseState: "pending",
      bookingId,
    });
    await repo((r) => r.queueReviewResponse(rv!.id, "Thank you, Ana!", STAFF));
    await deliverOutbound({ db: handle.db, ...deps }, ORG);
    expect(fake.ledger.reviewResponses).toEqual([
      { reviewId: expect.any(String), body: "Thank you, Ana!" },
    ]);
    expect((await repo((r) => r.listReviews({})))[0]!.responseState).toBe("responded");
  });
});
