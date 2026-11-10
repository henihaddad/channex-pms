# @channex-pms/sdk

Typed client for the Channex PMS public API (`/api/v1`). Apache-2.0, no workspace dependencies:
integrations, plugins and scripts can depend on it without inheriting the Sustainable Use License
of the core.

```ts
import { createClient } from "@channex-pms/sdk";

const pms = createClient({ baseUrl: "https://pms.example", token: accessToken, orgId });
const properties = await pms.properties.list();
const grid = await pms.ari.grid({ from: "2026-10-01", to: "2026-10-30" });
await pms.ari.editRates({
  propertyId,
  edits: [{ ratePlanId, date: "2026-10-05", values: { rate: 12000 }, expectedVersion: 3 }],
});
```

With an API key from Settings → API & AI (it carries its organization, no `orgId` needed):

```ts
const pms = createClient({ baseUrl: "https://app.otabridge.com", token: process.env.OTAB_KEY });
const { arrivals, needsYou } = await pms.today();
await pms.ari.setPrices({
  propertyId,
  firstNight: "2026-12-19",
  lastNight: "2026-12-21",
  priceMinor: 15500,
});
const { conversations } = await pms.conversations.list({ filter: "needs_reply" });
await pms.conversations.send(
  conversations[0].id,
  conversations[0].propertyId,
  "Yes, free parking.",
);
```

The same operations are an MCP server at `/api/mcp` for Claude. The OpenAPI document is served at `/api/v1/openapi.json`. Money is integer minor units; dates are
ISO calendar dates in the property's timezone.
