import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { setAvailability } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `set_availability`, same permission and audit. */
export const PUT = withPermission.route(
  "ari:update_restriction",
  restOptions(setAvailability),
  (ctx, input) => restRun(setAvailability, ctx, input),
);
