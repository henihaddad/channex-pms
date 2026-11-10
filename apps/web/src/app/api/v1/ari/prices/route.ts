import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { setPrices } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `set_prices`, same permission and audit. */
export const PUT = withPermission.route("ari:update_rate", restOptions(setPrices), (ctx, input) =>
  restRun(setPrices, ctx, input),
);
