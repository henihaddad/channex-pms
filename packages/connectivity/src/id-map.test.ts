import { describe, expect, it } from "vitest";
import { FakeProvider } from "./fake/fake-provider.js";
import { withIdMap } from "./id-map.js";

const meta = { dedupeKey: "k", requestId: "r" };

describe("withIdMap", () => {
  it("translates local ids outward and provider ids back, unknown ids pass through", async () => {
    const fake = new FakeProvider();
    const p = withIdMap(fake, {
      property: { local: "P", remote: "cx-p" },
      roomTypes: [{ local: "RT", remote: "cx-rt" }],
      ratePlans: [{ local: "RP", remote: "cx-rp" }],
    });
    await p.pushAvailability(
      {
        propertyId: "P",
        entries: [
          { roomTypeId: "RT", dateFrom: "2026-10-01", dateTo: "2026-10-01", availability: 1 },
        ],
      },
      meta,
    );
    await p.pushRatesAndRestrictions(
      {
        propertyId: "P",
        entries: [{ ratePlanId: "RP", dateFrom: "2026-10-01", dateTo: "2026-10-01", rate: 100 }],
      },
      meta,
    );
    expect(fake.ledger.ari.availability.get("cx-rt|2026-10-01")).toBe(1);
    const snap = await p.readAri(
      { propertyId: "P", dateFrom: "2026-10-01", dateTo: "2026-10-01" },
      meta,
    );
    expect(snap.availability[0]?.roomTypeId).toBe("RT");
    expect(snap.restrictions[0]?.ratePlanId).toBe("RP");
    fake.emitBooking({
      propertyId: "cx-p",
      roomTypeId: "cx-rt",
      ratePlanId: "cx-rp",
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-02",
      days: { "2026-10-01": 10000 },
    });
    const page = await p.listBookingRevisions("P", undefined, meta);
    expect(page.revisions[0]?.propertyId).toBe("P");
    expect(page.revisions[0]?.rooms[0]?.ratePlanId).toBe("RP");
    // non-translated methods keep working through the proxy
    expect((await p.getAdapterDescriptor("BookingCom", meta)).title).toBe("Booking.com");
  });
});
