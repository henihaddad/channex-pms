"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Id } from "@pms/core";
import {
  DrizzleOperationsRepository,
  rawRows,
  sql,
  type ExpenseRow,
  type PayoutRow,
  type StatementLineRow,
  type StatementRow,
} from "@pms/db";
import { queueAriPush, recomputeAvailability } from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { HttpProblem } from "@/server/errors";
import { OWNER_SCOPE_COOKIE } from "@/server/auth-flows";
import { notifyManager, openDisputeThread, owners, portalOwner } from "@/server/owners";

/**
 * Portal permission checks target the owner's own group (set at magic-link sign-in),
 * so the `owner` role's group-scoped grant satisfies them and nothing wider does.
 * Every handler then narrows again to the owner record linked to this login (OWN-3).
 */
async function ownerGroupScope(): Promise<{ kind: "group"; id: string }> {
  const id = (await cookies()).get(OWNER_SCOPE_COOKIE)?.value ?? "";
  return { kind: "group", id };
}
const ownScope = { scope: "group" as const, resolveScope: ownerGroupScope, audit: false };
const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
async function assertOwnerProperty(
  ctx: ActorCtx,
  propertyId: string,
): Promise<{ ownerId: string; ownerName: string }> {
  const o = await portalOwner(ctx);
  const scope = await (await owners(ctx)).portalScope(o.id);
  if (!scope.properties.some((p) => p.id === propertyId))
    throw new HttpProblem(403, "not_yours", "Not one of your properties");
  return { ownerId: o.id, ownerName: o.name };
}

export interface PortalHome {
  ownerName: string;
  dashboard: Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["portalDashboard"]>>;
  monthFrom: string;
}
export const loadPortalHome = withPermission<[], PortalHome>(
  "statement:read_own",
  ownScope,
  async (ctx) => {
    const o = await portalOwner(ctx);
    const now = new Date();
    const monthFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const monthTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
    return {
      ownerName: o.name,
      dashboard: await (await owners(ctx)).portalDashboard(o.id, monthFrom, monthTo),
      monthFrom,
    };
  },
);

export const loadPortalCalendar = withPermission<
  [{ from: string; to: string }],
  {
    bookings: Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["portalBookings"]>>;
    blocks: Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["portalBlocks"]>>;
    properties: Array<{ id: string; title: string }>;
  }
>("booking:read", ownScope, async (ctx, w) => {
  const o = await portalOwner(ctx);
  const repo = await owners(ctx);
  return {
    bookings: await repo.portalBookings(o.id, w.from, w.to),
    blocks: await repo.portalBlocks(o.id, w.from, w.to),
    properties: (await repo.portalScope(o.id)).properties,
  };
});

/** PORT-3: an owner stay is inventory; it goes through unit_block, availability and the push pipeline like any block. */
export const ownerStayAction = withPermission<[FormData], void>(
  "block:manage",
  { ...propertyScope, subject: (fd) => ({ kind: "unit_block", id: "owner_stay" }) },
  async (ctx, fd) => {
    const propertyId = String(fd.get("propertyId"));
    const { ownerId, ownerName } = await assertOwnerProperty(ctx, propertyId);
    const from = String(fd.get("dateFrom"));
    const to = String(fd.get("dateTo"));
    if (!(from < to)) throw new HttpProblem(422, "dates", "The stay must end after it starts");
    const [rt] = await rawRows<{ id: string; unit_id: string | null }>(
      ctx.tx,
      sql`select rt.id, (select u.id from unit u where u.room_type_id = rt.id order by u.name limit 1) as unit_id from room_type rt where rt.property_id = ${propertyId} order by rt.created_at limit 1`,
    );
    if (!rt) throw new HttpProblem(422, "no_room_type", "This property has no room type yet");
    const [clash] = await rawRows<{ n: number }>(
      ctx.tx,
      sql`select count(*)::int as n from booking b where b.property_id = ${propertyId} and b.status <> 'cancelled' and b.arrival_date < ${to} and b.departure_date > ${from}`,
    );
    if ((clash?.n ?? 0) > 0)
      throw new HttpProblem(409, "occupied", "Those nights already have a reservation");
    const ops = new DrizzleOperationsRepository(ctx.tx, ctx.orgId);
    await ops.insertBlock({
      id: Id.next(),
      propertyId,
      roomTypeId: rt.id,
      unitId: rt.unit_id,
      dateFrom: from,
      dateTo: to,
      reason: "owner_stay",
      reducesAvailability: true,
      note: String(fd.get("note") ?? "") || `Owner stay: ${ownerName}`,
      ownerId,
      createdBy: ctx.userId,
    });
    await recomputeAvailability(
      ctx.tx,
      ctx.orgId,
      propertyId,
      rt.id,
      from,
      to,
      Date.now(),
      "owner_stay",
    );
    await queueAriPush(ctx.tx, ctx.orgId, propertyId, Date.now(), "owner_stay");
    await notifyManager(ctx, "owner_stay", `${ownerName} blocked ${from} → ${to}`, {
      propertyId,
      from,
      to,
    });
    revalidatePath("/owner/calendar");
  },
);

export const loadPortalStatements = withPermission<[], StatementRow[]>(
  "statement:read_own",
  ownScope,
  async (ctx) => {
    const o = await portalOwner(ctx);
    return (await (await owners(ctx)).statements({ ownerId: o.id })).filter(
      (s) => s.state !== "draft" && s.state !== "approved",
    );
  },
);

export const loadPortalStatement = withPermission<
  [{ id: string }],
  (StatementRow & { lines: StatementLineRow[]; payouts: PayoutRow[] }) | null
>(
  "statement:read_own",
  { ...ownScope, audit: true, subject: (i) => ({ kind: "owner_statement", id: i.id }) },
  async (ctx, { id }) => {
    const o = await portalOwner(ctx);
    const st = await (await owners(ctx)).statement(id);
    if (!st || st.ownerId !== o.id || st.state === "draft" || st.state === "approved") return null;
    return st;
  },
);

/** A dispute opens a thread with the manager (spec 17 §17.5, ADR-0003); the statement stays as sent. */
export const disputeStatementAction = withPermission<[FormData], void>(
  "statement:read_own",
  {
    ...ownScope,
    audit: true,
    subject: (fd) => ({ kind: "owner_statement", id: String(fd.get("id")) }),
  },
  async (ctx, fd) => {
    const o = await portalOwner(ctx);
    const id = String(fd.get("id"));
    const st = await (await owners(ctx)).statement(id);
    if (!st || st.ownerId !== o.id) throw new HttpProblem(404, "not_found", "Statement not found");
    const reason = String(fd.get("reason") ?? "").trim();
    if (reason === "") throw new HttpProblem(422, "reason", "Say what looks wrong");
    await openDisputeThread(ctx, id, o.name, reason);
    await notifyManager(
      ctx,
      "statement_dispute",
      `${o.name} disputed statement ${st.periodFrom.slice(0, 7)}`,
      { statementId: id },
    );
    revalidatePath(`/owner/statements/${id}`);
  },
);

export const loadPortalExpenses = withPermission<[], ExpenseRow[]>(
  "expense:read",
  ownScope,
  async (ctx) => {
    const o = await portalOwner(ctx);
    return (await (await owners(ctx)).listExpenses({ ownerId: o.id, state: "approved" })).filter(
      (e) => e.statementId !== null,
    );
  },
);

export const loadPortalIssues = withPermission<
  [],
  {
    issues: Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["portalIssues"]>>;
    properties: Array<{ id: string; title: string }>;
  }
>("maintenance:read", ownScope, async (ctx) => {
  const o = await portalOwner(ctx);
  const repo = await owners(ctx);
  return {
    issues: await repo.portalIssues(o.id),
    properties: (await repo.portalScope(o.id)).properties,
  };
});

export const raiseIssueAction = withPermission<[FormData], void>(
  "maintenance:create",
  { ...propertyScope, subject: () => ({ kind: "maintenance_issue", id: "owner" }) },
  async (ctx, fd) => {
    const propertyId = String(fd.get("propertyId"));
    const { ownerName } = await assertOwnerProperty(ctx, propertyId);
    const description = String(fd.get("description") ?? "").trim();
    if (description === "") throw new HttpProblem(422, "description", "Describe the problem");
    await new DrizzleOperationsRepository(ctx.tx, ctx.orgId).insertIssue({
      id: Id.next(),
      propertyId,
      unitId: null,
      reportedBy: ctx.userId,
      reportedVia: "owner",
      severity: "normal",
      category: "general",
      description: `${description} (raised by owner ${ownerName})`,
    });
    await notifyManager(ctx, "owner_issue", `${ownerName} raised an issue`, { propertyId });
    revalidatePath("/owner/maintenance");
  },
);

export const loadPortalReviews = withPermission<
  [],
  Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["portalReviews"]>>
>("review:read", ownScope, async (ctx) =>
  (await owners(ctx)).portalReviews((await portalOwner(ctx)).id),
);

export const loadPortalDocuments = withPermission<
  [],
  {
    documents: Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["documents"]>>;
    agreements: Array<{
      propertyTitle: string;
      version: number;
      effectiveFrom: string;
      effectiveTo: string | null;
      commissionBasis: string;
      model: unknown;
    }>;
  }
>("agreement:read", ownScope, async (ctx) => {
  const o = await portalOwner(ctx);
  const repo = await owners(ctx);
  return {
    documents: await repo.documents(o.id),
    agreements: (await repo.listAgreements({ ownerId: o.id })).map((a) => ({
      propertyTitle: a.propertyTitle,
      version: a.version,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
      commissionBasis: a.commissionBasis,
      model: a.model,
    })),
  };
});
