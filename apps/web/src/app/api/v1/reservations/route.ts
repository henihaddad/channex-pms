import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { createReservation, listReservations } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `list_reservations` and `create_reservation`, same permission and audit. */
export const GET = withPermission.route(
  "booking:read",
  restOptions(listReservations),
  (ctx, input) => restRun(listReservations, ctx, input),
);
export const POST = withPermission.route(
  "booking:create",
  restOptions(createReservation),
  (ctx, input) => restRun(createReservation, ctx, input),
);
