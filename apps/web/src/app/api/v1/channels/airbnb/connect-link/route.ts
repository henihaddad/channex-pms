import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { connectAirbnb } from "@/server/agent/channel-ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `connect_airbnb`, same permission and audit. */
export const GET = withPermission.route("channel:read", restOptions(connectAirbnb), (ctx, input) =>
  restRun(connectAirbnb, ctx, input),
);
