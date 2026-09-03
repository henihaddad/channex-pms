import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { AuthError, ThrottleError, TransientError, ValidationError } from "@pms/core";
import { ChannexProvider, maskPan } from "./provider.js";
import { loadFixtures, ReplayTransport } from "../transport/fixtures.js";

const fixtures = loadFixtures(resolve(import.meta.dirname, "../../fixtures/channex"));
const meta = { dedupeKey: "t", requestId: "r" };
const PROPERTY = "716305c4-561a-4561-a187-7f5b8aeb5920";

function provider() {
  const http = new ReplayTransport(fixtures);
  return { p: new ChannexProvider(http), http };
}

describe("ChannexProvider contract (fixtures)", () => {
  it("pushes availability with date ranges and reads task ids", async () => {
    const { p, http } = provider();
    const r = await p.pushAvailability(
      {
        propertyId: PROPERTY,
        entries: [
          { roomTypeId: "rt", dateFrom: "2026-10-01", dateTo: "2026-10-10", availability: 1 },
        ],
      },
      meta,
    );
    expect(r).toMatchObject({
      accepted: 1,
      rejected: [],
      taskIds: ["eb31d631-4fcc-478a-80c3-bf7a2acf0699"],
    });
    expect(http.calls[0]?.body).toEqual({
      values: [
        {
          property_id: PROPERTY,
          room_type_id: "rt",
          date_from: "2026-10-01",
          date_to: "2026-10-10",
          availability: 1,
        },
      ],
    });
    expect(http.calls[0]?.headers).toMatchObject({ "idempotency-key": "t", "x-request-id": "r" });
  });

  it("turns 200-with-warnings into per-entry rejections and sends rates as minor units", async () => {
    const { p, http } = provider();
    const r = await p.pushRatesAndRestrictions(
      {
        propertyId: PROPERTY,
        entries: [
          {
            ratePlanId: "rp",
            dateFrom: "2026-10-01",
            dateTo: "2026-10-03",
            rate: -100,
            minStay: 2,
            days: ["fr", "sa"],
          },
          {
            ratePlanId: "rp",
            dateFrom: "2026-10-04",
            dateTo: "2026-10-05",
            rate: 12000,
            stopSell: true,
          },
        ],
      },
      meta,
    );
    expect(r.accepted).toBe(1);
    expect(r.rejected).toEqual([
      { index: 0, reason: "rate: must be greater than or equal to 0", field: "rate" },
    ]);
    const body = http.calls[0]?.body as { values: Array<Record<string, unknown>> };
    expect(body.values[0]).toMatchObject({
      rate: -100,
      min_stay_arrival: 2,
      min_stay_through: 2,
      days: ["fr", "sa"],
    });
    expect(body.values[1]).toMatchObject({ rate: 12000, stop_sell: true });
  });

  it("reads ARI back into the snapshot shape with minor-unit rates", async () => {
    const { p } = provider();
    const snap = await p.readAri(
      { propertyId: PROPERTY, dateFrom: "2026-10-01", dateTo: "2026-10-02" },
      meta,
    );
    expect(snap.availability).toEqual([
      { roomTypeId: "994d1375-dbbd-4072-8724-b2ab32ce781b", date: "2026-10-01", availability: 1 },
      { roomTypeId: "994d1375-dbbd-4072-8724-b2ab32ce781b", date: "2026-10-02", availability: 0 },
    ]);
    expect(snap.restrictions[1]).toMatchObject({
      ratePlanId: "445835fb-7956-42ac-9efc-3e6f331f0808",
      date: "2026-10-02",
      rate: 15000,
      minStay: 2,
      stopSell: true,
    });
  });

  it("parses the documented booking revision: money in minor units, masked card, nullable inventory refs", async () => {
    const { p, http } = provider();
    const page = await p.listBookingRevisions(PROPERTY, undefined, meta);
    expect(page.nextCursor).toBeUndefined();
    expect(http.calls[0]?.query).toMatchObject({ "pagination[limit]": "100" });
    const rev = page.revisions[0]!;
    expect(rev).toMatchObject({
      systemId: "12331233123",
      status: "new",
      currency: "GBP",
      amount: 22000,
      otaCommission: 1000,
      otaName: "Booking.com",
      otaReservationCode: "9996013801",
    });
    expect(rev.rooms[0]).toMatchObject({
      roomTypeId: "994d1375-dbbd-4072-8724-b2ab32ce781b",
      days: { "2019-04-26": 20000 },
      occupancy: { adults: 2, children: 0, infants: 0 },
    });
    expect(rev.services).toEqual([{ name: "Breakfast", amount: 2000, isInclusive: false }]);
    expect(rev.guarantee).toEqual({
      cardType: "VI",
      maskedNumber: "411111******1111",
      expiry: "10/2020",
      cardholder: "Channex User",
    });
    expect(JSON.stringify(rev.guarantee)).not.toMatch(/\d{13,}/);
    expect(rev.customer).toMatchObject({ email: "user@channex.io", country: "NL" });
    await p.ackBookingRevisions([rev.revisionId], meta);
    expect(http.calls.at(-1)?.path).toBe(
      "/api/v1/booking_revisions/03dd7198-c5b7-493c-a889-74d0c2211de7/ack",
    );
  });

  it("classifies errors per spec 05 §5.10", async () => {
    const { p } = provider();
    await expect(p.ensureGroup({ title: "x" }, meta)).rejects.toBeInstanceOf(AuthError);
    await expect(
      p.ensureRoomType(
        {
          propertyId: PROPERTY,
          title: "x",
          countOfRooms: 1,
          occAdults: 2,
          occChildren: 0,
          occInfants: 0,
          defaultOccupancy: 2,
        },
        meta,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const throttle = p.ensureRatePlan(
      {
        propertyId: PROPERTY,
        roomTypeId: "rt",
        title: "x",
        currency: "EUR",
        sellMode: "per_room",
        options: [],
      },
      meta,
    );
    await expect(throttle).rejects.toBeInstanceOf(ThrottleError);
    await throttle.catch((e: ThrottleError) => expect(e.retryAfterMs).toBe(2000));
    await expect(p.getAdapterDescriptor("BookingCom", meta)).rejects.toBeInstanceOf(TransientError);
  });

  it("masks PANs defensively (INV-7)", () => {
    expect(maskPan("4111111111111111")).toBe("411111******1111");
    expect(maskPan("411111******1111")).toBe("411111******1111");
    expect(maskPan("1234")).toBe("****");
  });
});

describe("ChannexProvider contract: provisioning and adoption", () => {
  it("registers exactly one webhook per property with the secret header (PROV-4)", async () => {
    const { p, http } = provider();
    const r = await p.ensureWebhook(
      {
        propertyId: PROPERTY,
        callbackUrl: "https://pms.example/webhooks/channex/tok",
        eventMask: "*",
        secret: "s",
        sendData: true,
      },
      meta,
    );
    expect(r.id).toBe("8ab9e0a2-3f3c-4c2f-9d1b-6d2f0e7b1a11");
    expect(http.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      webhook: {
        property_id: PROPERTY,
        callback_url: "https://pms.example/webhooks/channex/tok",
        event_mask: "*",
        headers: { "x-channex-webhook-secret": "s" },
        send_data: true,
      },
    });
  });
  it("imports a property with its room types and rate plans, paginating explicitly (Q7)", async () => {
    const { p, http } = provider();
    const imp = await p.importProperty({ id: PROPERTY }, meta);
    expect(imp.property).toMatchObject({
      title: "Demo Hotel",
      currency: "GBP",
      timezone: "Europe/London",
      groupId: "3a1f0c5e-1111-4a3b-9c1d-000000000001",
    });
    expect(imp.roomTypes).toEqual([
      {
        id: "994d1375-dbbd-4072-8724-b2ab32ce781b",
        title: "Standard Room",
        countOfRooms: 20,
        occAdults: 3,
        occChildren: 2,
        occInfants: 1,
      },
    ]);
    expect(imp.ratePlans.map((r) => [r.title, r.parentRatePlanId])).toEqual([
      ["Best Available Rate", null],
      ["Non Refundable", "e2f6e0a1-2222-4b3c-8d1e-000000000002"],
    ]);
    expect(
      http.calls.every(
        (c) =>
          c.method !== "GET" ||
          c.path.includes("/properties/") ||
          c.query?.["pagination[limit]"] === "100",
      ),
    ).toBe(true);
  });
});

describe("ChannexProvider channel screen (docs fixtures)", () => {
  it("asks for a one-time token for the property and returns it", async () => {
    const { p, http } = provider();
    const r = await p.createChannelSession(PROPERTY, meta);
    expect(r).toEqual({ token: "example-one-time-token" });
    expect(http.calls[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/auth/one_time_token",
      body: { one_time_token: { property_id: PROPERTY } },
    });
  });

  it("lists the property's channel connections with their mappings", async () => {
    const { p } = provider();
    const rows = await p.listChannels(PROPERTY, meta);
    expect(rows).toEqual([
      {
        id: "3d5a8f2e-1c4b-4a0e-9f7d-2b6c8e1a5d90",
        adapterCode: "AirBNB",
        title: "Airbnb · Ribeira Loft",
        isActive: true,
        status: "active",
        mappings: [
          { ratePlanId: "rp-remote-1", roomCode: "12345", rateCode: "12345-STD", occupancy: 2 },
        ],
      },
    ]);
  });
});

describe("ChannexProvider Airbnb through Channex (docs fixtures)", () => {
  const CHANNEL = "3d5a8f2e-1c4b-4a0e-9f7d-2b6c8e1a5d90";

  it("asks Channex for Airbnb's authorisation link with our callback and token", async () => {
    const { p, http } = provider();
    const r = await p.createAirbnbConnectionLink(
      {
        propertyIds: [PROPERTY],
        redirectUri: "https://app.example/cb",
        failureRedirectUri: "https://app.example/cb?failed=1",
        token: "tok",
        title: "Airbnb",
      },
      meta,
    );
    expect(r.url).toMatch(/^https:\/\/www\.airbnb\.com\/oauth2\/auth/);
    expect(http.calls[0]).toMatchObject({ method: "GET", path: `/api/v1/properties/${PROPERTY}` });
    expect(http.calls[1]).toMatchObject({
      method: "POST",
      path: "/api/v1/meta/airbnb/connection_link",
      body: {
        connection_link: {
          group_id: "3a1f0c5e-1111-4a3b-9c1d-000000000001",
          properties: [PROPERTY],
          redirect_uri: "https://app.example/cb",
          failure_redirect_uri: "https://app.example/cb?failed=1",
          token: "tok",
          title: "Airbnb",
          settings: { min_stay_type: "Arrival", booking_amount_settings: "Payout Amount" },
        },
      },
    });
  });

  it("lists the host's listings, maps one to a rate plan and starts the reservation import", async () => {
    const { p, http } = provider();
    const listings = await p.listChannelListings({ id: CHANNEL }, meta);
    expect(listings).toEqual([
      {
        id: "12345678",
        title: "Cozy Studio in Paris",
        type: "Entire home/apt",
        city: "Paris",
        countryCode: "FR",
        occupancies: [1, 2, 3, 4],
        qualityStatus: "excellent",
      },
    ]);
    const m = await p.mapListing(
      { id: CHANNEL },
      { ratePlanId: "rp-remote-1", listingId: "12345678" },
      meta,
    );
    expect(m).toEqual({ id: "8a1c2e3d-4f5a-4b6c-8d7e-9f0a1b2c3d4e" });
    expect(http.calls[1]?.body).toEqual({
      mapping: { rate_plan_id: "rp-remote-1", settings: { listing_id: "12345678" } },
    });
    await p.loadFutureReservations({ id: CHANNEL }, meta);
    expect(http.calls[2]).toMatchObject({
      method: "POST",
      path: `/api/v1/channels/${CHANNEL}/execute/load_future_reservations`,
    });
  });
});
