import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { getReservation } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `get_reservation`, same permission and audit. */
export const GET = withPermission.route("booking:read", restOptions(getReservation), (ctx, input) =>
  restRun(getReservation, ctx, input),
);
