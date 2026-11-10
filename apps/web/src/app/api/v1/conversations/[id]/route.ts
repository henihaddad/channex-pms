import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { readConversation } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `read_conversation`, same permission and audit. */
export const GET = withPermission.route(
  "message:read",
  restOptions(readConversation),
  (ctx, input) => restRun(readConversation, ctx, input),
);
