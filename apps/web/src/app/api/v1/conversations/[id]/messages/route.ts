import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { sendMessage } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `send_message`, same permission and audit. */
export const POST = withPermission.route("message:send", restOptions(sendMessage), (ctx, input) =>
  restRun(sendMessage, ctx, input),
);
