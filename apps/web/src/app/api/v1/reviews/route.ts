import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { listReviews } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `list_reviews`, same permission and audit. */
export const GET = withPermission.route("review:read", restOptions(listReviews), (ctx, input) =>
  restRun(listReviews, ctx, input),
);
