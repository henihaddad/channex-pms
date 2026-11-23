import { getTranslations } from "next-intl/server";
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
  // the cleaner app shows `detail` as it is: in the cleaner's language, saying what to do
  const t = await getTranslations("cleaner.errors");
  if (!task) throw new HttpProblem(404, "not_found", t("taskGone"), t("taskGone"));
  if (task.assigneeId !== ctx.userId && !(await isCoordinator(ctx)))
    throw new HttpProblem(403, "not_yours", t("notYours"), t("notYours"));
  if (input.progress)
    await ops.saveProgress(input.taskId, input.progress, input.photos ?? task.photos);
  if (input.state === "done") {
    const items = (await ops.checklistFor(task.type))?.items ?? [];
    const progress = input.progress ?? task.progress;
    if (checklistBlockers(items, progress).length > 0) {
      const done = new Map(progress.map((p) => [p.key, p]));
      const left = items
        .filter((it) => {
          const p = done.get(it.key);
          return !p?.done || (it.requiresPhoto && !p.photoRef);
        })
        .map((it) => it.label)
        .join(", ");
      const detail = t("checklist", { items: left });
      throw new HttpProblem(422, "checklist_incomplete", detail, detail);
    }
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
  // one checklist query per task type, not per task: a day of six changeovers reads it once
  const types = [...new Set(tasks.map((t) => t.type))];
  const lists = await Promise.all(types.map((type) => ops.checklistFor(type)));
  const byType = new Map(types.map((type, i) => [type, lists[i]?.items ?? []]));
  return { date, tasks: tasks.map((t) => ({ ...t, checklist: byType.get(t.type) ?? [] })) };
}
