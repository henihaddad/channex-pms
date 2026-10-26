import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeClock,
  Id,
  diffProjection,
  guideCompleteness,
  interpolate,
  projectRevision,
  type BookingRevisionPayload,
  type Crypto,
  type Id as IdT,
} from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { withoutTenant, withTenant, type Tx } from "../tenant.js";
import * as s from "../schema/index.js";
import { DrizzlePropertyRepository } from "./properties.js";
import { DrizzleBookingRepository } from "./bookings.js";
import { DrizzleGuideRepository } from "./guides.js";
import { DrizzleMessagingRepository } from "./messaging.js";

/**
 * The guest guide through real SQL (spec 10 §10.6b): it is written whole per locale,
 * it is isolated per tenant like any org table, and a template reads it only once it
 * is published (GUIDE-1) and in the guest's own language.
 */
let handle: DbHandle;
const ORG = Id.next();
const OTHER_ORG = Id.next();
const actor = { type: "user" as const, id: Id.next() };
const clock = new FakeClock("2026-09-01T12:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(handle.db, { orgId: ORG, actor }, fn);
const runOther = <T>(fn: (tx: Tx) => Promise<T>) =>
  withTenant(handle.db, { orgId: OTHER_ORG, actor }, fn);
let propertyId: IdT;
let roomTypeId: IdT;
let ratePlanId: IdT;
let bookingId = "";

const org = (id: string, slug: string) =>
  withoutTenant(handle.db, (tx) =>
    tx.insert(s.organization).values({
      id,
      name: slug,
      slug,
      country: "PT",
      defaultCurrency: "EUR",
    }),
  );

beforeAll(async () => {
  handle = await createTestDb();
  await org(ORG, "org-guide");
  await org(OTHER_ORG, "org-guide-other");
  await withoutTenant(handle.db, (tx) =>
    tx.insert(s.user).values({
      id: actor.id,
      email: "ops@guide.example",
      name: "Ops",
      passwordHash: "x",
      locale: "en",
    }),
  );
  const created = await run((tx) =>
    createProperty(
      {
        repo: new DrizzlePropertyRepository(tx, ORG),
        clock,
        orgId: ORG,
        horizonDays: 60,
        webhookCredentials: async () => ({ token: "tg", secretSealed: "s:x" }),
      },
      { title: "Graça Studio", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
    ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;

  // a Portuguese-speaking guest, so the locale choice is a real one
  const revision: BookingRevisionPayload = {
    revisionId: Id.next(),
    bookingId: "cx-guide-1",
    systemId: "sys-1",
    propertyId,
    status: "new",
    arrivalDate: "2026-10-04",
    departureDate: "2026-10-07",
    currency: "EUR",
    amount: 30000,
    otaName: "BookingCom",
    otaReservationCode: "GUIDE1",
    insertedAt: "2026-09-01T10:00:00Z",
    rooms: [
      {
        roomTypeId,
        ratePlanId,
        checkinDate: "2026-10-04",
        checkoutDate: "2026-10-07",
        days: { "2026-10-04": 10000, "2026-10-05": 10000, "2026-10-06": 10000 },
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [{ name: "Ana", surname: "Silva" }],
      },
    ],
    customer: { name: "Ana", surname: "Silva", email: "ana@example.com", language: "pt" },
    services: [],
    taxes: [],
    raw: {},
  };
  await run(async (tx) => {
    const repo = new DrizzleBookingRepository(tx, ORG, crypto);
    const next = projectRevision(revision, Id.next());
    await repo.applyRevision({
      revision,
      projection: next,
      diff: diffProjection(null, next),
      events: [],
      now: clock.now().toString(),
    });
    bookingId = next.bookingId;
  });
});
afterAll(() => handle.close());

const wifi = {
  kind: "wifi" as const,
  heading: null,
  body: "Router is in the hallway cupboard.",
  fields: { name: "Graca-Guest", password: "azulejo2026" },
};
const parking = { kind: "parking" as const, heading: null, body: "Space 4, under the block." };

describe("the guide is written whole, per locale (spec 10 §10.6b)", () => {
  it("round-trips a guide, keeps a section a newer version adds empty, and starts unpublished", async () => {
    await run((tx) =>
      new DrizzleGuideRepository(tx, ORG).save(
        propertyId,
        "en",
        { sections: [wifi, parking] },
        actor.id,
      ),
    );
    const g = await run((tx) => new DrizzleGuideRepository(tx, ORG).get(propertyId, "en"));
    expect(g?.published).toBe(false);
    expect(g?.updatedAt).toBeTruthy();
    expect(g?.sections.find((x) => x.kind === "wifi")?.fields).toEqual({
      name: "Graca-Guest",
      password: "azulejo2026",
    });
    // every known section is present, so the editor always shows the full set of prompts
    expect(guideCompleteness(g!)).toMatchObject({ written: 2 });
    expect(g!.sections.length).toBeGreaterThanOrEqual(8);
  });

  it("saving again replaces the guide and leaves `published` where the manager put it", async () => {
    const repo = (tx: Tx) => new DrizzleGuideRepository(tx, ORG);
    await run((tx) => repo(tx).setPublished(propertyId, "en", true));
    await run((tx) => repo(tx).save(propertyId, "en", { sections: [parking] }, actor.id));
    const g = await run((tx) => repo(tx).get(propertyId, "en"));
    expect(g?.published).toBe(true);
    expect(g?.sections.find((x) => x.kind === "wifi")?.body).toBe("");
    expect(guideCompleteness(g!).written).toBe(1);
    // and back: unpublishing is its own action too
    await run((tx) => repo(tx).setPublished(propertyId, "en", false));
    expect((await run((tx) => repo(tx).get(propertyId, "en")))?.published).toBe(false);
  });

  it("keeps a guide per locale and lists the ones written", async () => {
    await run(async (tx) => {
      const repo = new DrizzleGuideRepository(tx, ORG);
      await repo.save(propertyId, "en", { sections: [wifi, parking] }, actor.id);
      await repo.save(
        propertyId,
        "pt",
        { sections: [{ kind: "parking", body: "Lugar 4, na garagem." }] },
        actor.id,
      );
    });
    const all = await run((tx) => new DrizzleGuideRepository(tx, ORG).forProperty(propertyId));
    expect(all.map((g) => g.locale)).toEqual(["en", "pt"]);
  });

  it("is isolated per tenant like any org table (INV-10)", async () => {
    const theirs = await runOther((tx) =>
      new DrizzleGuideRepository(tx, OTHER_ORG).forProperty(propertyId),
    );
    expect(theirs).toEqual([]);
  });
});

describe("GUIDE-1: a template reads only a published guide", () => {
  const body =
    "Hi {{guest.first_name}}. Wi-Fi: {{guide.wifi_name}} / {{guide.wifi_password}}. Parking: {{guide.parking}}";

  it("leaves every guide variable missing while the guide is a draft", async () => {
    await run((tx) => new DrizzleGuideRepository(tx, ORG).setPublished(propertyId, "en", false));
    await run((tx) => new DrizzleGuideRepository(tx, ORG).setPublished(propertyId, "pt", false));
    const ctx = await run((tx) =>
      new DrizzleMessagingRepository(tx, ORG, crypto).templateContext(bookingId),
    );
    expect(ctx?.guide).toBeUndefined();
    expect(interpolate(body, ctx!).missing).toEqual([
      "guide.wifi_name",
      "guide.wifi_password",
      "guide.parking",
    ]);
  });

  it("fills them from the guest's own language once published, falling back to English", async () => {
    await run((tx) => new DrizzleGuideRepository(tx, ORG).setPublished(propertyId, "en", true));
    const en = await run((tx) =>
      new DrizzleMessagingRepository(tx, ORG, crypto).templateContext(bookingId),
    );
    // only `en` is published, so the Portuguese guest still gets the English guide
    expect(interpolate(body, en!).text).toContain("Graca-Guest / azulejo2026");

    await run((tx) => new DrizzleGuideRepository(tx, ORG).setPublished(propertyId, "pt", true));
    const pt = await run((tx) =>
      new DrizzleMessagingRepository(tx, ORG, crypto).templateContext(bookingId),
    );
    const rendered = interpolate(body, pt!);
    expect(rendered.text).toContain("Lugar 4, na garagem.");
    // the Portuguese guide has no Wi-Fi section, and says so rather than sending a blank
    expect(rendered.missing).toEqual(["guide.wifi_name", "guide.wifi_password"]);
  });
});
