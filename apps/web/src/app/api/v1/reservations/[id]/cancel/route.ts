import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { cancelReservation } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `cancel_reservation`, same permission and audit. */
export const POST = withPermission.route(
  "booking:cancel",
  restOptions(cancelReservation),
  (ctx, input) => restRun(cancelReservation, ctx, input),
);
