import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { listProperties } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `list_properties`, same permission and audit. */
export const GET = withPermission.route(
  "property:read",
  restOptions(listProperties),
  (ctx, input) => restRun(listProperties, ctx, input),
);
