import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { getToday } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `get_today`, same permission and audit. */
export const GET = withPermission.route("booking:read", restOptions(getToday), (ctx, input) =>
  restRun(getToday, ctx, input),
);
