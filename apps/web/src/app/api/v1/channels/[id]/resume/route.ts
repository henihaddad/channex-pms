import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { resumeChannel } from "@/server/agent/channel-ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `resume_channel`, same permission and audit. */
export const POST = withPermission.route(
  "channel:activate",
  restOptions(resumeChannel),
  (ctx, input) => restRun(resumeChannel, ctx, input),
);
