import { z } from "zod";
import { withPermission } from "@/server/with-permission";
import { updateTask, type TaskUpdate } from "@/server/ops";

const schema = z.object({
  state: z.enum(["accepted", "on_site", "done"]),
  progress: z
    .array(z.object({ key: z.string(), done: z.boolean(), photoRef: z.string().optional() }))
    .optional(),
  photos: z
    .array(
      z.object({
        ref: z.string(),
        takenAt: z.string(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

/** Offline queue target (OPS-6): idempotent per state transition, so a replayed update after reconnect is harmless. */
export const PATCH = withPermission.route<TaskUpdate>(
  "turnover:complete",
  {
    scope: "organization",
    input: async (req, params) => ({
      taskId: String(params.id),
      ...schema.parse(await req.json()),
    }),
    subject: (i) => ({ kind: "turnover_task", id: i.taskId }),
  },
  async (ctx, input) => {
    try {
      return Response.json(await updateTask(ctx, input));
    } catch (e) {
      // a replayed transition (already accepted / already done) is a no-op, not an error, for the offline queue
      if (
        e instanceof Error &&
        e.name === "DomainError" &&
        /cannot move a (accepted|on_site|done|inspected) task to (accepted|on_site|done)/.test(
          e.message,
        )
      )
        return Response.json({ state: input.state, replayed: true });
      throw e;
    }
  },
);
