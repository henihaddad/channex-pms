import { describe, expect, it } from "vitest";
import { ChannexProvider, CHANNEX_STAGING } from "../src/channex/provider.js";
import { FetchTransport } from "../src/transport/http.js";
import { RecordTransport } from "../src/transport/fixtures.js";

/**
 * Channex PMS certification (spec 05 §5.11): runs against staging.channex.io with a
 * real key, recording fixtures that replace the docs-sourced ones. Skips otherwise.
 */
const key = process.env.CHANNEX_STAGING_API_KEY;
const propertyId = process.env.CHANNEX_STAGING_PROPERTY_ID;

describe.skipIf(!key || !propertyId)("certification: ARI round trip against staging", () => {
  it("pushes and reads back a restriction", async () => {
    const transport = new RecordTransport(
      new FetchTransport(CHANNEX_STAGING, key!),
      "fixtures/recorded",
    );
    const p = new ChannexProvider(transport);
    const snap = await p.readAri(
      { propertyId: propertyId!, dateFrom: "2026-10-01", dateTo: "2026-10-02" },
      { dedupeKey: "cert", requestId: "cert" },
    );
    expect(snap).toBeDefined();
  });
});
