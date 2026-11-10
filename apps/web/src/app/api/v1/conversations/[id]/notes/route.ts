import { withPermission } from "@/server/with-permission";
import { restOptions, restRun } from "@/server/agent/op";
import { addNote } from "@/server/agent/ops";

/** Public API v1 (spec 04 §4.7a): the same operation as the MCP tool `add_note`, same permission and audit. */
export const POST = withPermission.route("message:send", restOptions(addNote), (ctx, input) =>
  restRun(addNote, ctx, input),
);
