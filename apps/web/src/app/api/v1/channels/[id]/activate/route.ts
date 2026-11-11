import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { activateChannel } from "@/server/agent/channel-ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `activate_channel`, same permission and audit. */
export const POST = withPermission.route(
  "channel:activate",
  restOptions(activateChannel),
  (ctx, input) => restRun(activateChannel, ctx, input),
);
