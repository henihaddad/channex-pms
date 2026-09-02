import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeClock,
  FakeLockProvider,
  FakePaymentProvider,
  Id,
  type Crypto,
} from "@pms/core";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  DrizzleBookingEngineRepository,
  DrizzlePropertyRepository,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import {
  confirmBooking,
  createHold,
  enableDirectChannel,
  expireHolds,
  guestCancel,
  guestMessage,
  guestPortal,
  saveHoldGuest,
  searchProperty,
  sendAbandonmentMails,
  type EngineDeps,
} from "./booking-engine.js";

/**
 * M7 exit (spec 15, spec 10): a hold takes the room out of availability for every
 * channel (BE-5) and gives it back on expiry; the confirm step is idempotent (BE-6);
 * a declined card keeps the hold; a confirmed direct booking is a booking like any
 * other, with a folio, a door code, a portal session and a confirmation mail
 * carrying the .ics (BE-7); the portal reveals the code only inside the window,
 * takes a guest message into the direct thread and cancels under the policy.
 */
let handle: DbHandle;
const ORG = Id.next();
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-05-03T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const payments = new FakePaymentProvider();
const mails: Array<{ to: string; template: string; params: Record<string, string> }> = [];
let deps: EngineDeps;
let propertyId: string;
let roomTypeId: string;
let ratePlanId: string;
const run = <T>(fn: (tx: Parameters<Parameters<typeof asSystem>[2]>[0]) => Promise<T>) =>
  asSystem(handle.db, ORG, fn);
const availability = async (date: string): Promise<number> => {
  const [r] = await run((tx) =>
    rawRows<{ available: number }>(
      tx,
      sql`select available from availability_day where room_type_id = ${roomTypeId} and date = ${date}`,
    ),
  );
  return Number(r?.available ?? -1);
};
const guest = {
  name: "Ana",
  surname: "Silva",
  email: "ana@example.com",
  phone: null,
  language: "pt",
  requests: null,
};
const holdInput = (arrival: string, departure: string) => ({
  propertyId,
  roomTypeId,
  ratePlanId,
  arrivalDate: arrival,
  departureDate: departure,
  adults: 2,
  children: 0,
  childAges: [],
  extras: [],
  promoCode: null,
  locale: "en",
});

beforeAll(async () => {
  handle = await createTestDb();
  deps = {
    db: handle.db,
    clock,
    crypto,
    log,
    mailer: {
      send: async (m) => {
        mails.push(m);
      },
    },
    payments,
    lock: new FakeLockProvider(() => 0.42),
    appUrl: "https://pms.example",
  };
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-be", country: "PT", defaultCurrency: "EUR" }),
  );
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
          webhookCredentials: async () => ({ token: "tok-be", secretSealed: "s:x" }),
        },
        { title: "Douro Flat", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
      ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;
  await run((tx) => tx.update(schema.property).set({ state: "live" }));
  await run((tx) =>
    new DrizzleBookingEngineRepository(tx, ORG, crypto).saveSettings(propertyId, {
      guarantee: { kind: "prepay" },
      taxes: { vatBps: 0, cityTaxPerPersonNightMinor: 200, cityTaxMaxNights: 7 },
      accessRevealHours: 24,
      abandonmentEmails: true,
    }),
  );
});
afterAll(() => handle.close());

describe("holds (BE-5)", () => {
  it("the direct channel is a ChannelConnection; a hold decrements availability_day and expiry restores it", async () => {
    const connectionId = await run((tx) => enableDirectChannel(deps, tx, ORG, propertyId, true));
    const [conn] = await run((tx) =>
      rawRows<{ adapter_code: string; state: string }>(
        tx,
        sql`select adapter_code, state from channel_connection where id = ${connectionId}`,
      ),
    );
    expect(conn).toEqual({ adapter_code: "direct", state: "active" });
    const search = await run((tx) =>
      searchProperty(deps, tx, ORG, propertyId, {
        arrivalDate: "2026-05-10",
        departureDate: "2026-05-12",
        adults: 2,
        children: 0,
      }),
    );
    expect(search.offers).toHaveLength(1);
    expect(search.offers[0]!.available).toBe(1);
    expect(await availability("2026-05-10")).toBe(1);
    const hold = await run((tx) =>
      createHold(deps, tx, ORG, holdInput("2026-05-10", "2026-05-12")),
    );
    expect(hold.quote.nights).toBe(2);
    expect(hold.quote.cityTaxMinor).toBe(2 * 2 * 200);
    expect(hold.quote.dueNowMinor).toBe(hold.quote.totalMinor);
    expect(await availability("2026-05-10")).toBe(0);
    expect(await availability("2026-05-11")).toBe(0);
    expect(await availability("2026-05-12")).toBe(1);
    // the same dates are gone for the next guest, on every channel
    await expect(
      run((tx) => createHold(deps, tx, ORG, holdInput("2026-05-11", "2026-05-13"))),
    ).rejects.toThrow(/no longer available/);
    clock.advance({ minutes: 16 });
    expect(await expireHolds(deps)).toBe(1);
    expect(await availability("2026-05-10")).toBe(1);
    const [row] = await run((tx) =>
      rawRows<{ state: string }>(tx, sql`select state from booking_hold where id = ${hold.holdId}`),
    );
    expect(row?.state).toBe("expired");
  });

  it("abandonment mails go once, only with consent and only where enabled", async () => {
    const hold = await run((tx) =>
      createHold(deps, tx, ORG, holdInput("2026-05-20", "2026-05-21")),
    );
    await run((tx) => saveHoldGuest(deps, tx, ORG, hold.holdId, guest, true));
    clock.advance({ minutes: 16 });
    await expireHolds(deps);
    expect(await sendAbandonmentMails(deps, ORG)).toBe(1);
    expect(await sendAbandonmentMails(deps, ORG)).toBe(0);
    expect(mails.filter((m) => m.template === "booking_abandoned")).toHaveLength(1);
  });
});

describe("confirm (BE-6, BE-7)", () => {
  let holdId: string;
  let bookingId: string;
  it("a declined card keeps the hold and reports why", async () => {
    const hold = await run((tx) =>
      createHold(deps, tx, ORG, holdInput("2026-05-10", "2026-05-12")),
    );
    holdId = hold.holdId;
    await run((tx) => saveHoldGuest(deps, tx, ORG, holdId, guest, false));
    const r = await confirmBooking(
      deps,
      ORG,
      { holdId, idempotencyKey: "k1", paymentMethodToken: "tok_decline" },
      run,
    );
    expect(r.state).toBe("declined");
    expect(await availability("2026-05-10")).toBe(0);
  });

  it("3-D Secure round-trips through requires_action and then confirms", async () => {
    const first = await confirmBooking(
      deps,
      ORG,
      { holdId, idempotencyKey: "k2", paymentMethodToken: "tok_3ds" },
      run,
    );
    expect(first.state).toBe("requires_action");
    const second = await confirmBooking(
      deps,
      ORG,
      { holdId, idempotencyKey: "k2", paymentMethodToken: null },
      run,
    );
    expect(second.state).toBe("confirmed");
    if (second.state !== "confirmed") throw new Error("unreachable");
    bookingId = second.bookingId;
    expect(second.portalToken).toBeTruthy();
  });

  it("a second confirm with the same key returns the same booking, availability is unchanged", async () => {
    const again = await confirmBooking(
      deps,
      ORG,
      { holdId, idempotencyKey: "k2", paymentMethodToken: "tok_visa" },
      run,
    );
    expect(again.state).toBe("confirmed");
    if (again.state !== "confirmed") throw new Error("unreachable");
    expect(again.bookingId).toBe(bookingId);
    const [n] = await run((tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from booking where property_id = ${propertyId}`,
      ),
    );
    expect(n?.n).toBe(1);
    expect(await availability("2026-05-10")).toBe(0);
    expect(await availability("2026-05-11")).toBe(0);
  });

  it("the booking has a folio with the city tax and the captured payment, a door code and a direct thread; the mail carries the .ics", async () => {
    const [b] = await run((tx) =>
      rawRows<{ ota_name: string; status: string; total: number }>(
        tx,
        sql`select ota_name, status, total_amount_minor as total from booking where id = ${bookingId}`,
      ),
    );
    expect(b?.ota_name).toBe("direct");
    expect(b?.status).toBe("new");
    const lines = await run((tx) =>
      rawRows<{ kind: string; amount_minor: number }>(
        tx,
        sql`select fl.kind, fl.amount_minor from folio_line fl join folio f on f.id = fl.folio_id where f.booking_id = ${bookingId} order by fl.kind`,
      ),
    );
    expect(lines.map((l) => l.kind)).toContain("tourist_tax");
    const [pay] = await run((tx) =>
      rawRows<{ state: string; amount_minor: number; provider_ref: string }>(
        tx,
        sql`select p.state, p.amount_minor, p.provider_ref from payment p join folio f on f.id = p.folio_id where f.booking_id = ${bookingId}`,
      ),
    );
    expect(pay?.state).toBe("captured");
    expect(pay?.provider_ref).toMatch(/^pi_fake_/);
    const [cred] = await run((tx) =>
      rawRows<{ type: string; revoked_at: string | null }>(
        tx,
        sql`select type, revoked_at from access_credential where booking_id = ${bookingId}`,
      ),
    );
    expect(cred).toEqual({ type: "door_code", revoked_at: null });
    const [thread] = await run((tx) =>
      rawRows<{ provider: string }>(
        tx,
        sql`select provider from message_thread where booking_id = ${bookingId}`,
      ),
    );
    expect(thread?.provider).toBe("direct");
    const mail = mails.find((m) => m.template === "booking_confirmation");
    expect(mail?.to).toBe("ana@example.com");
    expect(mail?.params.ics).toContain("BEGIN:VEVENT");
    expect(mail?.params.ics).toContain("DTSTART:20260510T");
    expect(mail?.params.portalUrl).toMatch(/^https:\/\/pms\.example\/guest\?token=/);
    const audit = await run((tx) =>
      rawRows<{ action: string; actor_type: string }>(
        tx,
        sql`select action, actor->>'type' as actor_type from audit_log where org_id = ${ORG} and actor->>'type' = 'guest' order by seq`,
      ),
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["booking_engine:hold", "booking:create"]),
    );
  });

  it("the portal hides the code until the window, takes a message into the inbox and cancels under the policy with a refund", async () => {
    const before = await run((tx) => guestPortal(deps, tx, ORG, bookingId));
    expect(before?.access.state).toBe("hidden");
    expect(before?.folio.balanceMinor).toBe(0);
    expect(before?.cancellation.allowed).toBe(true);
    expect(before?.cancellation.feeNowMinor).toBe(0);
    await run((tx) => guestMessage(deps, tx, ORG, bookingId, "What time can we arrive?"));
    const after = await run((tx) => guestPortal(deps, tx, ORG, bookingId));
    expect(after?.messages.map((m) => m.direction)).toEqual(["inbound"]);
    const [t] = await run((tx) =>
      rawRows<{ unread_count: number }>(
        tx,
        sql`select unread_count from message_thread where booking_id = ${bookingId}`,
      ),
    );
    expect(t?.unread_count).toBe(1);
    // the day before arrival at 16:00 local: 23 h before check-in, inside the 24 h window
    clock.set("2026-05-09T15:00:00Z");
    const open = await run((tx) => guestPortal(deps, tx, ORG, bookingId));
    expect(open?.access.state).toBe("revealed");
    clock.set("2026-05-04T09:00:00Z");
    const cancel = await guestCancel(deps, ORG, bookingId, run);
    expect(cancel.feeMinor).toBe(0);
    // everything the card paid comes back: room nights plus the city tax
    expect(cancel.refundedMinor).toBe(before!.totalMinor + 800);
    expect(payments.refunds).toHaveLength(1);
    expect(await availability("2026-05-10")).toBe(1);
    const gone = await run((tx) => guestPortal(deps, tx, ORG, bookingId));
    expect(gone?.status).toBe("cancelled");
    expect(gone?.cancellation.allowed).toBe(false);
  });
});
