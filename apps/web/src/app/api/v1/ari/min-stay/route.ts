import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { setMinStay } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `set_min_stay`, same permission and audit. */
export const PUT = withPermission.route(
  "ari:update_restriction",
  restOptions(setMinStay),
  (ctx, input) => restRun(setMinStay, ctx, input),
);
