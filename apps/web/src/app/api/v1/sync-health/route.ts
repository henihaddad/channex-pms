import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { getSyncHealth } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `get_sync_health`, same permission and audit. */
export const GET = withPermission.route("ari:read", restOptions(getSyncHealth), (ctx, input) =>
  restRun(getSyncHealth, ctx, input),
);
