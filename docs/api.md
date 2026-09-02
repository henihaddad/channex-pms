# Public API

`/api/v1` is a JSON REST API described by OpenAPI 3.1 at `/api/v1/openapi.json`. Authenticate
with `POST /api/v1/auth/login` (or an API key) and send `Authorization: Bearer <token>` and
`X-PMS-Org: <organization id>`. Errors are `application/problem+json` and name the missing
permission. Money is integer minor units; dates are ISO calendar dates in the property's
timezone; stays are half-open ranges.

The typed client is `@channex-pms/sdk` (Apache-2.0, no workspace dependencies):

```ts
import { createClient } from "@channex-pms/sdk";
const pms = createClient({ baseUrl, token, orgId });
const grid = await pms.ari.grid({ from: "2026-10-01", to: "2026-10-30" });
```

Rate limits per plan apply to `api.read` and `api.write` in hosted mode (QUOTA-1: never to
webhooks or booking acknowledgements). Every request carries `x-request-id` in the response for
support.
