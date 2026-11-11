import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { listAirbnbListings } from "@/server/agent/channel-ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `list_airbnb_listings`, same permission and audit. */
export const GET = withPermission.route(
  "channel:read",
  restOptions(listAirbnbListings),
  (ctx, input) => restRun(listAirbnbListings, ctx, input),
);
