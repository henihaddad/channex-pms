import {
  Id,
  planBulkUpdate,
  type BulkInput,
  type RateCell,
  type RestrictionValues,
} from "@pms/core";
import { queueAriPush } from "@pms/jobs";
import {
  checkCellVersions,
  DrizzlePropertyRepository,
  medianRate,
  rawRows,
  sql,
  type CellEdit,
  type CellEditOutcome,
} from "@pms/db";
import type { ActorCtx } from "./with-permission";
import { HttpProblem } from "./errors";

export interface EditResult {
  outcomes: CellEditOutcome[];
  undoId: string | null;
}

/**
 * Calendar edits (CAL-3, CAL-4, CAL-5): version-checked, applied with derived
 * recompute, recorded as a reversible operation, and queued for push.
 */
export async function applyCellEdits(
  ctx: ActorCtx,
  propertyId: string,
  edits: readonly CellEdit[],
  source: string,
): Promise<EditResult> {
  await assertPlansInProperty(
    ctx,
    propertyId,
    edits.map((e) => e.ratePlanId),
  );
  const outcomes = await checkCellVersions(ctx.tx, edits);
  const conflicts = outcomes.filter((o) => !o.ok);
  if (conflicts.length > 0) return { outcomes, undoId: null };
  const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
  const inverse: RateCell[] = [];
  for (const e of edits) {
    const [cur] = await repo.rateCells(e.ratePlanId, e.date, e.date);
    inverse.push({
      ratePlanId: e.ratePlanId,
      date: e.date,
      values: pick(cur?.values ?? {}, Object.keys(e.values) as (keyof RestrictionValues)[]),
    });
  }
  await repo.applyRateCells(
    propertyId,
    edits.map((e) => ({ ratePlanId: e.ratePlanId, date: e.date, values: e.values })),
    source,
    ctx.userId,
  );
  const undoId = Id.next();
  await repo.insertBulkOperation({
    id: undoId,
    propertyId,
    input: { kind: "cell_edit", edits },
    cellCount: edits.length,
    inverse,
    createdBy: ctx.userId,
  });
  await queueAriPush(ctx.tx, ctx.orgId, propertyId, Date.now(), source);
  return { outcomes, undoId };
}

/** BULK-1..4: dry run or apply; the plan's inverse is the undo. */
export async function runBulk(
  ctx: ActorCtx,
  propertyId: string,
  input: BulkInput,
  dryRun: boolean,
  today: string,
) {
  await assertPlansInProperty(ctx, propertyId, input.ratePlanIds);
  const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
  const current = new Map<string, RestrictionValues>();
  for (const id of input.ratePlanIds)
    for (const c of await repo.rateCells(id, input.dateFrom, input.dateTo))
      current.set(`${id}|${c.date}`, c.values);
  const plan = planBulkUpdate(input, current, await medianRate(ctx.tx, propertyId, today));
  const summary = {
    cellCount: plan.cellCount,
    samples: plan.samples.slice(0, 5),
    warnings: plan.warnings,
    blocked: plan.blocked,
  };
  if (dryRun || (plan.blocked.length > 0 && !input.override))
    return { ...summary, applied: false, id: null };
  await repo.applyRateCells(propertyId, plan.changes, "bulk", ctx.userId);
  const id = Id.next();
  await repo.insertBulkOperation({
    id,
    propertyId,
    input,
    cellCount: plan.cellCount,
    inverse: plan.inverse,
    createdBy: ctx.userId,
  });
  await queueAriPush(ctx.tx, ctx.orgId, propertyId, Date.now(), "bulk");
  return { ...summary, applied: true, id };
}

/** CAL-4 / BULK-2: apply the recorded inverse; the undo is itself a new, reversible operation. */
export async function undoOperation(
  ctx: ActorCtx,
  operationId: string,
  propertyId: string,
): Promise<{ cellCount: number; redoId: string }> {
  const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
  const op = await repo.getBulkOperation(operationId);
  if (!op || op.propertyId !== propertyId)
    throw new HttpProblem(404, "not_found", "Operation not found");
  if (op.state === "undone")
    throw new HttpProblem(409, "already_undone", "Operation already undone");
  const before: RateCell[] = [];
  for (const c of op.inverse) {
    const [cur] = await repo.rateCells(c.ratePlanId, c.date, c.date);
    before.push({
      ratePlanId: c.ratePlanId,
      date: c.date,
      values: pick(cur?.values ?? {}, Object.keys(c.values) as (keyof RestrictionValues)[]),
    });
  }
  await repo.applyRateCells(op.propertyId, op.inverse, "undo", ctx.userId);
  await repo.markBulkUndone(operationId);
  const redoId = Id.next();
  await repo.insertBulkOperation({
    id: redoId,
    propertyId: op.propertyId,
    input: { kind: "undo", of: operationId },
    cellCount: op.inverse.length,
    inverse: before,
    createdBy: ctx.userId,
  });
  await queueAriPush(ctx.tx, ctx.orgId, op.propertyId, Date.now(), "undo");
  return { cellCount: op.inverse.length, redoId };
}

async function assertPlansInProperty(
  ctx: ActorCtx,
  propertyId: string,
  ratePlanIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(ratePlanIds)];
  if (ids.length === 0) return;
  const rows = await rawRows<{ n: number }>(
    ctx.tx,
    sql`select count(*)::int as n from rate_plan where property_id = ${propertyId} and id in (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`,
  );
  if ((rows[0]?.n ?? 0) !== ids.length)
    throw new HttpProblem(422, "cross_property", "Rate plans must belong to the property (INV-8)");
}

function pick(
  values: RestrictionValues,
  keys: readonly (keyof RestrictionValues)[],
): RestrictionValues {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = values[k] ?? null;
  return out as RestrictionValues;
}
