import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { replyToReview } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `reply_to_review`, same permission and audit. */
export const POST = withPermission.route(
  "review:respond",
  restOptions(replyToReview),
  (ctx, input) => restRun(replyToReview, ctx, input),
);
