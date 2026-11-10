import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { getCalendar } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `get_calendar`, same permission and audit. */
export const GET = withPermission.route("ari:read", restOptions(getCalendar), (ctx, input) =>
  restRun(getCalendar, ctx, input),
);
