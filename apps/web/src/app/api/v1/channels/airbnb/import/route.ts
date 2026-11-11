import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { importAirbnbListingOp } from "@/server/agent/channel-ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `import_airbnb_listing`, same permission and audit. */
export const POST = withPermission.route(
  "channel:create",
  restOptions(importAirbnbListingOp),
  (ctx, input) => restRun(importAirbnbListingOp, ctx, input),
);
