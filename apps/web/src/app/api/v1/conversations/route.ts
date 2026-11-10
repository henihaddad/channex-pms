import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { listConversations } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `list_conversations`, same permission and audit. */
export const GET = withPermission.route(
  "message:read",
  restOptions(listConversations),
  (ctx, input) => restRun(listConversations, ctx, input),
);
