import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { pauseChannel } from "@/server/agent/channel-ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `pause_channel`, same permission and audit. */
export const POST = withPermission.route(
  "channel:deactivate",
  restOptions(pauseChannel),
  (ctx, input) => restRun(pauseChannel, ctx, input),
);
