"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Id, type ExpenseCategory } from "@pms/core";
import {
  DrizzleIdentityRepository,
  DrizzleMessagingRepository,
  enqueueOutbox,
  rawRows,
  sql,
  type AgreementRow,
  type ExpenseRow,
  type OwnerRow,
  type PayoutRow,
  type StatementLineRow,
  type StatementRow,
} from "@pms/db";
import { generateStatement, initiatePayout, sendStatement } from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { identity } from "@/server/auth-flows";
import { EXPENSE_CATEGORIES, owners, propertyCurrency, termsFromForm } from "@/server/owners";

const org = { scope: "organization" as const };
/** Driver errors wrap the database message in `cause`; read the whole chain. */
const errorChain = (e: unknown): string => {
  let out = "";
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    out += ` ${cur.message}`;
    cur = cur.cause;
  }
  return out;
};
const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};

// ---- owners and agreements (spec 17 §17.1) ---------------------------------------------------

export const listOwners = withPermission<[], OwnerRow[]>(
  "owner:read",
  { ...org, audit: false },
  async (ctx) => (await owners(ctx)).listOwners(),
);

export interface OwnerDetail {
  owner: OwnerRow;
  agreements: AgreementRow[];
  statements: StatementRow[];
  documents: Awaited<ReturnType<Awaited<ReturnType<typeof owners>>["documents"]>>;
  properties: Array<{ id: string; title: string; currency: string }>;
  units: Array<{ id: string; propertyId: string; name: string }>;
}
export const loadOwner = withPermission<[{ id: string }], OwnerDetail | null>(
  "owner:read",
  { ...org, audit: false },
  async (ctx, { id }) => {
    const repo = await owners(ctx);
    const owner = await repo.owner(id);
    if (!owner) return null;
    const properties = await rawRows<{ id: string; title: string; currency: string }>(
      ctx.tx,
      sql`select id, title, currency from property where org_id = ${ctx.orgId} and archived_at is null order by title`,
    );
    const units = await rawRows<{ id: string; property_id: string; name: string }>(
      ctx.tx,
      sql`select id, property_id, name from unit where org_id = ${ctx.orgId} order by name`,
    );
    return {
      owner,
      agreements: await repo.listAgreements({ ownerId: id }),
      statements: await repo.statements({ ownerId: id }),
      documents: await repo.documents(id),
      properties,
      units: units.map((u) => ({ id: u.id, propertyId: u.property_id, name: u.name })),
    };
  },
);

const ownerSchema = z.object({
  type: z.enum(["individual", "company"]),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  taxId: z.string().nullable(),
  locale: z.string().min(2).max(5),
});
export const createOwnerAction = withPermission<[FormData], void>(
  "owner:create",
  { ...org, redact: ["taxId"] },
  async (ctx, fd) => {
    const opt = (k: string) => String(fd.get(k) ?? "").trim() || null;
    const o = ownerSchema.parse({
      type: fd.get("type") ?? "individual",
      name: fd.get("name"),
      email: opt("email"),
      phone: opt("phone"),
      taxId: opt("taxId"),
      locale: String(fd.get("locale") ?? "en"),
    });
    await (await owners(ctx)).createOwner({ ...o, address: {}, notes: null });
    revalidatePath("/owners");
  },
);

/** PAY-1: bank details are sealed on entry and shown masked ever after. */
export const setPayoutDetailsAction = withPermission<[FormData], void>(
  "owner:update",
  {
    ...org,
    redact: ["payoutDetails"],
    subject: (fd) => ({ kind: "owner", id: String(fd.get("ownerId")) }),
  },
  async (ctx, fd) => {
    const v = String(fd.get("payoutDetails") ?? "").trim();
    if (v.length < 6)
      throw new HttpProblem(
        422,
        "invalid",
        "Enter the account reference (IBAN or connected account id)",
      );
    await (await owners(ctx)).setPayoutDetails(String(fd.get("ownerId")), v);
    revalidatePath(`/owners/${String(fd.get("ownerId"))}`);
  },
);

/** Portal access: a passwordless user with the `owner` role on the owner's group (spec 02 §2.1, magic-link login). */
export const grantPortalAction = withPermission<[FormData], void>(
  "owner:update",
  { ...org, subject: (fd) => ({ kind: "owner", id: String(fd.get("ownerId")) }) },
  async (ctx, fd) => {
    const repo = await owners(ctx);
    const owner = await repo.owner(String(fd.get("ownerId")));
    if (!owner?.email || !owner.groupId)
      throw new HttpProblem(422, "needs_email", "The owner needs an email address first");
    const ids = new DrizzleIdentityRepository(ctx.tx);
    let user = await ids.findUserByEmail(owner.email.toLowerCase());
    if (!user) {
      const svc = await identity(ctx.tx);
      const r = await svc.createPasswordlessUser({
        email: owner.email,
        name: owner.name,
        locale: owner.locale,
      });
      if (!r.ok) throw new HttpProblem(422, r.error.code, r.error.message);
      user = r.value;
    }
    await ids.createGrant({
      id: Id.next(),
      orgId: ctx.orgId as Id,
      subjectType: "user",
      subjectId: user.id,
      roleKey: "owner",
      customRoleId: null,
      scopeType: "group",
      scopeId: owner.groupId as Id,
      overrides: null,
      expiresAt: null,
      createdBy: ctx.userId as Id,
    });
    await repo.linkPortalUser(owner.id, user.id);
    revalidatePath(`/owners/${owner.id}`);
  },
);

export const addDocumentAction = withPermission<[FormData], void>(
  "owner:update",
  { ...org, subject: (fd) => ({ kind: "owner", id: String(fd.get("ownerId")) }) },
  async (ctx, fd) => {
    const file = fd.get("file");
    const filename = file instanceof File ? file.name : String(fd.get("filename") ?? "document");
    const bytes = file instanceof File ? Buffer.from(await file.arrayBuffer()) : Buffer.from("");
    await (
      await owners(ctx)
    ).addDocument({
      ownerId: String(fd.get("ownerId")),
      kind: String(fd.get("kind") ?? "other"),
      filename,
      storageRef: `data:${file instanceof File ? file.type || "application/octet-stream" : "text/plain"};base64,${bytes.toString("base64")}`,
      expiresAt: String(fd.get("expiresAt") ?? "") || null,
    });
    revalidatePath(`/owners/${String(fd.get("ownerId"))}`);
  },
);

/** AGR-1..3: a version 1 or a new version; overlaps are refused by the database (INV-12). */
export const saveAgreementAction = withPermission<[FormData], void>(
  "agreement:manage",
  {
    ...propertyScope,
    subject: (fd) => ({ kind: "owner_agreement", id: String(fd.get("agreementKey") ?? "new") }),
  },
  async (ctx, fd) => {
    const currency = await propertyCurrency(ctx, String(fd.get("propertyId")));
    const terms = termsFromForm(fd, currency);
    if (!terms.effectiveFrom)
      throw new HttpProblem(422, "invalid", "Effective-from date is required");
    try {
      await (
        await owners(ctx)
      ).saveAgreement({
        ...terms,
        agreementKey: String(fd.get("agreementKey") ?? "") || null,
        createdBy: ctx.userId,
      });
    } catch (e) {
      if (/INV-12|overlaps/.test(errorChain(e)))
        throw new HttpProblem(
          409,
          "agreement_overlap",
          "Another agreement already covers these units and dates (INV-12)",
        );
      throw e;
    }
    revalidatePath(`/owners/${terms.ownerId}`);
  },
);

// ---- expenses (spec 17 §17.3) --------------------------------------------------------------

export const listExpenses = withPermission<
  [{ state?: string | null }],
  {
    rows: ExpenseRow[];
    properties: Array<{ id: string; title: string; currency: string }>;
    fourEyes: boolean;
  }
>("expense:read", { ...org, audit: false }, async (ctx, f) => {
  const repo = await owners(ctx);
  const properties = await rawRows<{ id: string; title: string; currency: string }>(
    ctx.tx,
    sql`select id, title, currency from property where org_id = ${ctx.orgId} and archived_at is null order by title`,
  );
  return {
    rows: await repo.listExpenses({ state: f.state ?? null }),
    properties,
    fourEyes: (await repo.orgSetting("expense_four_eyes")) === "on",
  };
});

const expenseSchema = z.object({
  propertyId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(EXPENSE_CATEGORIES as [ExpenseCategory, ...ExpenseCategory[]]),
  vendor: z.string().nullable(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  rebillable: z.boolean(),
  rebillReason: z.string().nullable(),
});
export const createExpenseAction = withPermission<[FormData], void>(
  "expense:create",
  propertyScope,
  async (ctx, fd) => {
    const e = expenseSchema.parse({
      propertyId: fd.get("propertyId"),
      date: fd.get("date"),
      category: fd.get("category"),
      vendor: String(fd.get("vendor") ?? "").trim() || null,
      description: fd.get("description"),
      amount: fd.get("amount"),
      rebillable: fd.get("rebillable") === "on",
      rebillReason: String(fd.get("rebillReason") ?? "").trim() || null,
    });
    const repo = await owners(ctx);
    const suggested = await repo.suggestRebillable(e.propertyId, e.category, e.date);
    if (e.rebillable !== suggested && !e.rebillReason)
      throw new HttpProblem(
        422,
        "reason_required",
        `The agreement suggests ${suggested ? "rebillable" : "absorbed"}; give a reason to override`,
      );
    const receipt = fd.get("receipt");
    const receiptRef =
      receipt instanceof File && receipt.size > 0
        ? `data:${receipt.type};name=${receipt.name};len=${String(receipt.size)}`
        : null;
    await repo.createExpense({
      ...e,
      unitId: null,
      amountMinor: Math.round(e.amount * 100),
      currency: await propertyCurrency(ctx, e.propertyId),
      receiptRef,
      submittedBy: ctx.userId,
    });
    revalidatePath("/owners/expenses");
  },
);

/** EXP-1: approval before a statement; the approver cannot be the submitter when the org enables four-eyes. */
export const approveExpenseAction = withPermission<[FormData], void>(
  "expense:approve",
  { ...propertyScope, subject: (fd) => ({ kind: "owner_expense", id: String(fd.get("id")) }) },
  async (ctx, fd) => {
    const repo = await owners(ctx);
    const fourEyes = (await repo.orgSetting("expense_four_eyes")) === "on";
    try {
      if (fd.get("decision") === "reject")
        await repo.rejectExpense(
          String(fd.get("id")),
          ctx.userId,
          String(fd.get("reason") ?? "rejected"),
        );
      else await repo.approveExpense(String(fd.get("id")), ctx.userId, fourEyes);
    } catch (e) {
      throw new HttpProblem(422, "expense_approval", e instanceof Error ? e.message : String(e));
    }
    revalidatePath("/owners/expenses");
  },
);

// ---- statements (spec 17 §17.2, STMT-5) ----------------------------------------------------

export const listStatements = withPermission<[{ state?: string | null }], StatementRow[]>(
  "statement:read",
  { ...org, audit: false },
  async (ctx, f) => (await owners(ctx)).statements({ state: f.state ?? null }),
);

export interface StatementView {
  statement: StatementRow & { lines: StatementLineRow[]; payouts: PayoutRow[] };
  previous: (StatementRow & { lines: StatementLineRow[] }) | null;
  fourEyesThreshold: number;
  payoutProvider: string;
}
export const loadStatement = withPermission<[{ id: string }], StatementView | null>(
  "statement:read",
  { ...org, subject: (i) => ({ kind: "owner_statement", id: i.id }) },
  async (ctx, { id }) => {
    const repo = await owners(ctx);
    const statement = await repo.statement(id);
    if (!statement) return null;
    const previous = statement.previousStatementId
      ? await repo.statement(statement.previousStatementId)
      : null;
    const c = await container();
    return {
      statement,
      previous,
      fourEyesThreshold: await repo.fourEyesThreshold(),
      payoutProvider: c.payouts.kind,
    };
  },
);

/** Generate or refresh the draft for an agreement's period; sent statements are never touched (INV-13). */
export const generateStatementAction = withPermission<[FormData], void>(
  "statement:generate",
  { ...org, subject: (fd) => ({ kind: "owner_agreement", id: String(fd.get("agreementKey")) }) },
  async (ctx, fd) => {
    const c = await container();
    const month = String(fd.get("periodMonth") ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpProblem(422, "period", "Pick a month");
    const from = `${month}-01`;
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const r = await generateStatement(
      {
        db: c.db.db,
        clock: c.clock,
        crypto: c.crypto,
        log: c.log,
        mailer: c.mailer,
        payouts: c.payouts,
        appUrl: c.config.NEXT_PUBLIC_APP_URL,
      },
      ctx.orgId,
      String(fd.get("agreementKey")),
      { from, to: d.toISOString().slice(0, 10) },
      (fn) => fn(ctx.tx),
    );
    if (!r) throw new HttpProblem(422, "no_agreement", "No agreement version covers that period");
    revalidatePath("/owners", "layout");
  },
);

export const approveStatementAction = withPermission<[FormData], void>(
  "statement:approve",
  { ...org, subject: (fd) => ({ kind: "owner_statement", id: String(fd.get("id")) }) },
  async (ctx, fd) => {
    await (await owners(ctx)).approve(String(fd.get("id")), ctx.userId);
    revalidatePath(`/owners/statements/${String(fd.get("id"))}`);
  },
);

export const sendStatementAction = withPermission<[FormData], void>(
  "statement:send",
  { ...org, subject: (fd) => ({ kind: "owner_statement", id: String(fd.get("id")) }) },
  async (ctx, fd) => {
    const c = await container();
    await sendStatement(
      {
        db: c.db.db,
        clock: c.clock,
        crypto: c.crypto,
        log: c.log,
        mailer: c.mailer,
        payouts: c.payouts,
        appUrl: c.config.NEXT_PUBLIC_APP_URL,
      },
      ctx.orgId,
      String(fd.get("id")),
      (fn) => fn(ctx.tx),
    );
    revalidatePath(`/owners/statements/${String(fd.get("id"))}`);
  },
);

export const resolveDisputeAction = withPermission<[FormData], void>(
  "statement:approve",
  { ...org, subject: (fd) => ({ kind: "owner_statement", id: String(fd.get("id")) }) },
  async (ctx, fd) => {
    await (await owners(ctx)).setDispute(String(fd.get("id")), "resolved", null);
    revalidatePath(`/owners/statements/${String(fd.get("id"))}`);
  },
);

// ---- payouts (spec 17 §17.4, PAY-1..3) -----------------------------------------------------

/** `payout:execute` is `!` in the matrix: step-up applies; four-eyes above the threshold parks the payout for a second person. */
export const initiatePayoutAction = withPermission<[FormData], void>(
  "payout:execute",
  { ...org, subject: (fd) => ({ kind: "owner_statement", id: String(fd.get("statementId")) }) },
  async (ctx, fd) => {
    const c = await container();
    const r = await initiatePayout(ctx.tx, ctx.orgId, c.crypto, {
      statementId: String(fd.get("statementId")),
      method: fd.get("method") === "manual" ? "manual" : "provider",
      initiatedBy: ctx.userId,
      reference: String(fd.get("reference") ?? "").trim() || null,
      providerKind: c.payouts.kind,
    }).catch((e: unknown) => {
      throw new HttpProblem(422, "payout", e instanceof Error ? e.message : String(e));
    });
    if (!r.awaitingApproval) await queuePayoutExecution(ctx, r.payoutId);
    revalidatePath(`/owners/statements/${String(fd.get("statementId"))}`);
    revalidatePath("/owners/payouts");
  },
);

export const approvePayoutAction = withPermission<[FormData], void>(
  "payout:execute",
  { ...org, subject: (fd) => ({ kind: "owner_payout", id: String(fd.get("id")) }) },
  async (ctx, fd) => {
    await (
      await owners(ctx)
    )
      .approvePayout(String(fd.get("id")), ctx.userId)
      .catch((e: unknown) => {
        throw new HttpProblem(422, "four_eyes", e instanceof Error ? e.message : String(e));
      });
    await queuePayoutExecution(ctx, String(fd.get("id")));
    revalidatePath("/owners/payouts");
  },
);

/** The provider call runs after the transaction (ADR-0007): the worker or the test drain picks up `payout.execute`. */
async function queuePayoutExecution(ctx: ActorCtx, payoutId: string): Promise<void> {
  await enqueueOutbox(ctx.tx, {
    type: "payout.execute",
    orgId: ctx.orgId as Id,
    aggregate: { kind: "owner_payout", id: payoutId as Id },
    payload: { payoutId },
    occurredAt: new Date().toISOString(),
    dedupeKey: `payout.execute:${payoutId}`,
  });
}

export const listPayouts = withPermission<[], PayoutRow[]>(
  "payout:read",
  { ...org, audit: false },
  async (ctx) => (await owners(ctx)).payouts({}),
);
