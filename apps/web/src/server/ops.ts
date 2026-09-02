import { checklistBlockers, type TaskState } from "@pms/core";
import { DrizzleOperationsRepository, rawRows, sql, type TaskRow } from "@pms/db";
import type { ActorCtx } from "./with-permission";
import { HttpProblem } from "./errors";

export interface TaskUpdate {
  taskId: string;
  state: TaskState;
  progress?: TaskRow["progress"];
  photos?: TaskRow["photos"];
  notes?: string;
}

/** Cleaner task flow (spec 08 §8.7): assignee-only, checklist enforced on `done`, unit flips to clean (OPS-7). */
export async function updateTask(ctx: ActorCtx, input: TaskUpdate): Promise<{ state: TaskState }> {
  const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
  const task = await ops.task(input.taskId);
  if (!task) throw new HttpProblem(404, "not_found", "Task not found");
  if (task.assigneeId !== ctx.userId && !(await isCoordinator(ctx)))
    throw new HttpProblem(403, "not_yours", "Only the assignee can update this task");
  if (input.progress)
    await ops.saveProgress(input.taskId, input.progress, input.photos ?? task.photos);
  if (input.state === "done") {
    const blockers = checklistBlockers(
      (await ops.checklistFor(task.type))?.items ?? [],
      input.progress ?? task.progress,
    );
    if (blockers.length > 0)
      throw new HttpProblem(422, "checklist_incomplete", blockers.join("; "));
    await ops.setUnitStatus(task.unitId, "clean");
  }
  const state = await ops.setState(input.taskId, input.state, {
    ...(input.photos ? { photos: input.photos } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  });
  return { state };
}

async function isCoordinator(ctx: ActorCtx): Promise<boolean> {
  const [g] = await rawRows<{ n: number }>(
    ctx.tx,
    sql`select count(*)::int as n from "grant" where subject_id = ${ctx.userId} and revoked_at is null and role_key in ('org_owner','org_admin','portfolio_manager','property_manager','ops_coordinator')`,
  );
  return (g?.n ?? 0) > 0;
}

export interface MyDay {
  date: string;
  tasks: Array<
    TaskRow & { checklist: Array<{ key: string; label: string; requiresPhoto: boolean }> }
  >;
}

/** Only the caller's assignments, only what a cleaner needs: no financials, no PII beyond first names. */
export async function myDay(ctx: ActorCtx, date: string): Promise<MyDay> {
  const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
  const tasks = await ops.tasksOn(date, { assigneeId: ctx.userId });
  const out: MyDay["tasks"] = [];
  for (const t of tasks)
    out.push({ ...t, checklist: (await ops.checklistFor(t.type))?.items ?? [] });
  return { date, tasks: out };
}
