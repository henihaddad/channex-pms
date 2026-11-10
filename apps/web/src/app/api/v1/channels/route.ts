import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { listChannels } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `list_channels`, same permission and audit. */
export const GET = withPermission.route("channel:read", restOptions(listChannels), (ctx, input) =>
  restRun(listChannels, ctx, input),
);
