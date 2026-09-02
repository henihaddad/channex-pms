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

The OpenAPI document is served at `/api/v1/openapi.json`. Money is integer minor units; dates are
ISO calendar dates in the property's timezone.
