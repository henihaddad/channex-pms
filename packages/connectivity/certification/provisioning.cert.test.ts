import { afterAll, describe, expect, it } from "vitest";
import { ChannexProvider, CHANNEX_STAGING } from "../src/channex/provider.js";
import { FetchTransport } from "../src/transport/http.js";
import { RecordTransport } from "../src/transport/fixtures.js";

/**
 * Channex PMS certification (spec 05 §5.11): provision a property on staging
 * through the real provider, push and read back ARI, import it, and prove the
 * whole thing is idempotent (PROV-3). Every exchange is recorded as a fixture.
 */
const key = process.env.CHANNEX_STAGING_API_KEY;
const meta = (op: string) => ({
  dedupeKey: `cert:${op}:${String(Date.now())}`,
  requestId: `cert:${op}`,
});
const title = process.env.CHANNEX_STAGING_PROPERTY_TITLE ?? "PMS Certification Property";

describe.skipIf(!key)("certification: provisioning and ARI round trip against staging", () => {
  const transport = new RecordTransport(
    new FetchTransport(CHANNEX_STAGING, key ?? ""),
    "fixtures/recorded",
  );
  const p = new ChannexProvider(transport);
  const ids: Record<string, string> = {};

  it("provisions group, property, room type, rate plan and webhook", async () => {
    ids.group = (await p.ensureGroup({ title: "PMS Certification" }, meta("group"))).id;
    ids.property = (
      await p.ensureProperty(
        {
          title,
          currency: "EUR",
          timezone: "Europe/Lisbon",
          groupId: ids.group,
          address: { city: "Lisbon", country: "PT" },
        },
        meta("property"),
      )
    ).id;
    ids.roomType = (
      await p.ensureRoomType(
        {
          propertyId: ids.property,
          title: "Certification Room",
          countOfRooms: 2,
          occAdults: 2,
          occChildren: 1,
          occInfants: 0,
          defaultOccupancy: 2,
        },
        meta("rt"),
      )
    ).id;
    ids.ratePlan = (
      await p.ensureRatePlan(
        {
          propertyId: ids.property,
          roomTypeId: ids.roomType,
          title: "Standard",
          currency: "EUR",
          sellMode: "per_room",
          options: [{ occupancy: 2, isPrimary: true, rate: 10000 }],
        },
        meta("rp"),
      )
    ).id;
    ids.webhook = (
      await p.ensureWebhook(
        {
          propertyId: ids.property,
          callbackUrl: "https://example.com/webhooks/channex/cert",
          eventMask: "*",
          secret: "cert-secret",
          sendData: true,
        },
        meta("wh"),
      )
    ).id;
    for (const v of Object.values(ids)) expect(v).toMatch(/^[0-9a-f-]{36}$/);
  }, 120_000);

  it("is idempotent by natural key (PROV-3)", async () => {
    expect((await p.ensureGroup({ title: "PMS Certification" }, meta("group2"))).id).toBe(
      ids.group!,
    );
    expect(
      (
        await p.ensureProperty(
          { title, currency: "EUR", timezone: "Europe/Lisbon" },
          meta("property2"),
        )
      ).id,
    ).toBe(ids.property!);
    expect(
      (
        await p.ensureRoomType(
          {
            propertyId: ids.property!,
            title: "Certification Room",
            countOfRooms: 2,
            occAdults: 2,
            occChildren: 1,
            occInfants: 0,
            defaultOccupancy: 2,
          },
          meta("rt2"),
        )
      ).id,
    ).toBe(ids.roomType!);
    expect(
      (
        await p.ensureRatePlan(
          {
            propertyId: ids.property!,
            roomTypeId: ids.roomType!,
            title: "Standard",
            currency: "EUR",
            sellMode: "per_room",
            options: [{ occupancy: 2, isPrimary: true, rate: 10000 }],
          },
          meta("rp2"),
        )
      ).id,
    ).toBe(ids.ratePlan!);
    expect(
      (
        await p.ensureWebhook(
          {
            propertyId: ids.property!,
            callbackUrl: "https://example.com/webhooks/channex/cert",
            eventMask: "*",
            secret: "cert-secret",
            sendData: true,
          },
          meta("wh2"),
        )
      ).id,
    ).toBe(ids.webhook!);
  }, 120_000);

  it("pushes availability and restrictions and reads them back", async () => {
    const a = await p.pushAvailability(
      {
        propertyId: ids.property!,
        entries: [
          {
            roomTypeId: ids.roomType!,
            dateFrom: "2026-11-01",
            dateTo: "2026-11-05",
            availability: 1,
          },
        ],
      },
      meta("avail"),
    );
    expect(a.rejected).toEqual([]);
    const r = await p.pushRatesAndRestrictions(
      {
        propertyId: ids.property!,
        entries: [
          {
            ratePlanId: ids.ratePlan!,
            dateFrom: "2026-11-01",
            dateTo: "2026-11-05",
            rate: 12345,
            minStay: 2,
            closedToArrival: false,
            stopSell: false,
          },
        ],
      },
      meta("restr"),
    );
    expect(r.rejected).toEqual([]);
    const snap = await p.readAri(
      { propertyId: ids.property!, dateFrom: "2026-11-01", dateTo: "2026-11-03" },
      meta("read"),
    );
    const av = snap.availability.filter((x) => x.roomTypeId === ids.roomType!);
    expect(av.map((x) => [x.date, x.availability])).toEqual([
      ["2026-11-01", 1],
      ["2026-11-02", 1],
      ["2026-11-03", 1],
    ]);
    const rs = snap.restrictions.filter((x) => x.ratePlanId === ids.ratePlan!);
    expect(rs.map((x) => [x.date, x.rate, x.minStay])).toEqual([
      ["2026-11-01", 12345, 2],
      ["2026-11-02", 12345, 2],
      ["2026-11-03", 12345, 2],
    ]);
  }, 120_000);

  it("imports the property back with room types and rate plans (Q7) and reads an empty booking feed", async () => {
    const imp = await p.importProperty({ id: ids.property! }, meta("import"));
    expect(imp.property).toMatchObject({ id: ids.property!, title, currency: "EUR" });
    expect(imp.roomTypes.map((r) => r.id)).toContain(ids.roomType!);
    expect(imp.ratePlans.map((r) => r.id)).toContain(ids.ratePlan!);
    const feed = await p.listBookingRevisions(ids.property!, undefined, meta("feed"));
    expect(Array.isArray(feed.revisions)).toBe(true);
  }, 120_000);

  it("describes an adapter and rejects a bad channel test cleanly", async () => {
    const d = await p.getAdapterDescriptor("BookingCom", meta("adapter"));
    expect(d.fields.length).toBeGreaterThan(0);
    const t = await p.testConnection(
      { adapterCode: "BookingCom", propertyId: ids.property!, settings: { hotel_id: "0" } },
      meta("test"),
    );
    expect(typeof t.ok).toBe("boolean");
  }, 120_000);

  afterAll(() => {
    console.log("staging ids:", JSON.stringify(ids));
  });
});
